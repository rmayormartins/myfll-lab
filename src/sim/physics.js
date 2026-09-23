// ============================================================================
//  MyFLL.lab :: physics.js
//  Motor de corpos rígidos 2,5D: dinâmica planar (x, y, yaw) sobre o tapete,
//  com faixas de altura (z0..z1) em cada forma para decidir quem colide com quem.
//  Unidades SI (m, kg, s, N). Tapete: origem no canto sudoeste, x para leste,
//  y para norte, ângulo anti-horário a partir de +x.
//  Solver por impulsos sequenciais (estilo Box2D) com atrito de Coulomb.
// ============================================================================

export const G = 9.81;
export const LINEAR_SLOP = 0.0004;     // 0,4 mm de penetração tolerada
export const BAUMGARTE = 0.18;
export const MAX_BIAS_V = 0.25;        // m/s, limite da velocidade de correção

let _nextId = 1;

// ---------------------------------------------------------------- formas
export function polyShape(pts, o = {}) {
  // pts: [[x,y], ...] em coordenadas locais; fica em sentido anti-horário
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  if (a < 0) pts = pts.slice().reverse();
  const n = pts.length;
  const lv = new Float64Array(n * 2), ln = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { lv[2 * i] = pts[i][0]; lv[2 * i + 1] = pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = lv[2 * j] - lv[2 * i], dy = lv[2 * j + 1] - lv[2 * i + 1];
    const L = Math.hypot(dx, dy) || 1;
    ln[2 * i] = dy / L; ln[2 * i + 1] = -dx / L;
  }
  return {
    type: 0, n, lv, ln, wv: new Float64Array(n * 2), wn: new Float64Array(n * 2),
    z0: o.z0 ?? 0, z1: o.z1 ?? 0.05, mu: o.mu ?? 0.4, e: o.e ?? 0.1,
    tag: o.tag || null, sensor: !!o.sensor, minX: 0, minY: 0, maxX: 0, maxY: 0, off: false,
  };
}

export function circleShape(cx, cy, r, o = {}) {
  return {
    type: 1, lx: cx, ly: cy, r, wx: 0, wy: 0,
    z0: o.z0 ?? 0, z1: o.z1 ?? 0.05, mu: o.mu ?? 0.4, e: o.e ?? 0.1,
    tag: o.tag || null, sensor: !!o.sensor, minX: 0, minY: 0, maxX: 0, maxY: 0, off: false,
  };
}

export function boxPts(w, d, cx = 0, cy = 0, ang = 0) {
  const c = Math.cos(ang), s = Math.sin(ang), hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cx + c * x - s * y, cy + s * x + c * y]);
}

export function setPolyLocal(sh, pts) { // reescreve vértices de uma forma já criada (mesmo nº de vértices)
  const n = sh.n;
  for (let i = 0; i < n; i++) { sh.lv[2 * i] = pts[i][0]; sh.lv[2 * i + 1] = pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = sh.lv[2 * j] - sh.lv[2 * i], dy = sh.lv[2 * j + 1] - sh.lv[2 * i + 1];
    const L = Math.hypot(dx, dy) || 1;
    sh.ln[2 * i] = dy / L; sh.ln[2 * i + 1] = -dx / L;
  }
}

// área e momento de inércia (por unidade de massa) de uma forma
function shapeAreaInertia(sh) {
  if (sh.type === 1) {
    const A = Math.PI * sh.r * sh.r;
    return { A, cx: sh.lx, cy: sh.ly, J: A * (0.5 * sh.r * sh.r + sh.lx * sh.lx + sh.ly * sh.ly) };
  }
  let A = 0, cx = 0, cy = 0, J = 0;
  const n = sh.n, v = sh.lv;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = v[2 * i], y1 = v[2 * i + 1], x2 = v[2 * j], y2 = v[2 * j + 1];
    const cr = x1 * y2 - x2 * y1;
    A += cr / 2;
    cx += (x1 + x2) * cr / 6; cy += (y1 + y2) * cr / 6;
    J += cr * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2) / 12;
  }
  return { A, cx: cx / A, cy: cy / A, J };
}

// ---------------------------------------------------------------- corpos
export function makeBody(o = {}) {
  const b = {
    id: o.id ?? _nextId++, kind: o.kind || 'dynamic',
    x: o.x || 0, y: o.y || 0, a: o.a || 0,
    vx: 0, vy: 0, w: 0,
    m: o.m ?? 0.1, I: 1e-4, im: 0, iI: 0,
    shapes: [], group: o.group || 0,
    groundMu: o.groundMu ?? 0.35,       // atrito com o tapete
    groundR: o.groundR ?? 0.02,         // raio efetivo para o atrito de giro
    ground: o.ground !== false,         // sofre atrito do tapete?
    lift: 0,                            // altura em que está suspenso (objetos içados)
    tag: o.tag || null, data: o.data || null,
    fx: 0, fy: 0, tq: 0,                // forças externas acumuladas no passo
    lamLin: [0, 0], lamAng: 0,          // impulsos acumulados do atrito com o tapete
    touch: 0,                           // marcador de contato com o robô
  };
  if (o.shapes) for (const s of o.shapes) b.shapes.push(s);
  if (o.shapes && o.autoMass !== false) setMassFromShapes(b, b.m);
  else setKind(b, b.kind);
  return b;
}

export function setMassFromShapes(b, m, keepOrigin = false) {
  let A = 0, cx = 0, cy = 0, J = 0;
  for (const s of b.shapes) { const r = shapeAreaInertia(s); A += r.A; cx += r.cx * r.A; cy += r.cy * r.A; J += r.J; }
  if (A <= 0) { b.m = m; b.I = m * 1e-4; setKind(b, b.kind); return { cx: 0, cy: 0 }; }
  cx /= A; cy /= A;
  // J é o momento polar em torno da origem local; passa para o centróide
  let Jc = J - A * (cx * cx + cy * cy);
  b.m = m; b.I = Math.max(1e-7, m * Jc / A);
  if (!keepOrigin && (Math.abs(cx) > 1e-9 || Math.abs(cy) > 1e-9)) {
    // desloca as formas para que a origem do corpo seja o centro de massa
    for (const s of b.shapes) {
      if (s.type === 1) { s.lx -= cx; s.ly -= cy; }
      else for (let i = 0; i < s.n; i++) { s.lv[2 * i] -= cx; s.lv[2 * i + 1] -= cy; }
    }
    const c = Math.cos(b.a), sn = Math.sin(b.a);
    b.x += c * cx - sn * cy; b.y += sn * cx + c * cy;
  }
  setKind(b, b.kind);
  return { cx, cy };
}

export function setKind(b, kind) {
  b.kind = kind;
  if (kind === 'dynamic') { b.im = 1 / b.m; b.iI = 1 / b.I; }
  else { b.im = 0; b.iI = 0; if (kind === 'static') { b.vx = b.vy = b.w = 0; } }
}

export function updateBodyShapes(b) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  for (const sh of b.shapes) {
    if (sh.type === 1) {
      sh.wx = b.x + c * sh.lx - s * sh.ly; sh.wy = b.y + s * sh.lx + c * sh.ly;
      sh.minX = sh.wx - sh.r; sh.maxX = sh.wx + sh.r; sh.minY = sh.wy - sh.r; sh.maxY = sh.wy + sh.r;
    } else {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < sh.n; i++) {
        const lx = sh.lv[2 * i], ly = sh.lv[2 * i + 1];
        const wx = b.x + c * lx - s * ly, wy = b.y + s * lx + c * ly;
        sh.wv[2 * i] = wx; sh.wv[2 * i + 1] = wy;
        const nx = sh.ln[2 * i], ny = sh.ln[2 * i + 1];
        sh.wn[2 * i] = c * nx - s * ny; sh.wn[2 * i + 1] = s * nx + c * ny;
        if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
      }
      sh.minX = x0; sh.minY = y0; sh.maxX = x1; sh.maxY = y1;
    }
  }
}

// ---------------------------------------------------------------- colisão
// Resultado: normal (de A para B), até 2 pontos com penetração
function maxSeparation(p1, p2) {
  let best = -1, maxSep = -1e9;
  for (let i = 0; i < p1.n; i++) {
    const nx = p1.wn[2 * i], ny = p1.wn[2 * i + 1];
    const vx = p1.wv[2 * i], vy = p1.wv[2 * i + 1];
    let si = 1e9;
    for (let j = 0; j < p2.n; j++) {
      const s = nx * (p2.wv[2 * j] - vx) + ny * (p2.wv[2 * j + 1] - vy);
      if (s < si) si = s;
    }
    if (si > maxSep) { maxSep = si; best = i; }
  }
  return [maxSep, best];
}

function collidePolys(pA, pB, out) {
  const [sepA, eA] = maxSeparation(pA, pB);
  if (sepA > 0) return 0;
  const [sepB, eB] = maxSeparation(pB, pA);
  if (sepB > 0) return 0;
  let ref, inc, edge, flip;
  if (sepB > sepA + 0.1 * LINEAR_SLOP) { ref = pB; inc = pA; edge = eB; flip = true; }
  else { ref = pA; inc = pB; edge = eA; flip = false; }
  const nx = ref.wn[2 * edge], ny = ref.wn[2 * edge + 1];
  // aresta incidente: normal mais anti-paralela
  let ie = 0, minDot = 1e9;
  for (let i = 0; i < inc.n; i++) {
    const d = nx * inc.wn[2 * i] + ny * inc.wn[2 * i + 1];
    if (d < minDot) { minDot = d; ie = i; }
  }
  const ie2 = (ie + 1) % inc.n;
  let ax = inc.wv[2 * ie], ay = inc.wv[2 * ie + 1], bx = inc.wv[2 * ie2], by = inc.wv[2 * ie2 + 1];
  const e2 = (edge + 1) % ref.n;
  const v1x = ref.wv[2 * edge], v1y = ref.wv[2 * edge + 1], v2x = ref.wv[2 * e2], v2y = ref.wv[2 * e2 + 1];
  let tx = v2x - v1x, ty = v2y - v1y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  // recorte contra os planos laterais
  const clip = (px, py, qx, qy, cx, cy, off) => {
    const dp = cx * px + cy * py - off, dq = cx * qx + cy * qy - off;
    const res = [];
    if (dp <= 0) res.push(px, py);
    if (dq <= 0) res.push(qx, qy);
    if (dp * dq < 0) { const t = dp / (dp - dq); res.push(px + t * (qx - px), py + t * (qy - py)); }
    return res;
  };
  let c1 = clip(ax, ay, bx, by, -tx, -ty, -(tx * v1x + ty * v1y));
  if (c1.length < 4) return 0;
  let c2 = clip(c1[0], c1[1], c1[2], c1[3], tx, ty, tx * v2x + ty * v2y);
  if (c2.length < 4) return 0;
  const onx = flip ? -nx : nx, ony = flip ? -ny : ny;
  let cnt = 0;
  for (let k = 0; k < 2; k++) {
    const px = c2[2 * k], py = c2[2 * k + 1];
    const sep = nx * (px - v1x) + ny * (py - v1y);
    if (sep <= LINEAR_SLOP * 0.5) {
      out.pts.push(px - nx * sep * 0.5, py - ny * sep * 0.5, -sep);
      cnt++;
    }
  }
  out.nx = onx; out.ny = ony;
  return cnt;
}

function collidePolyCircle(p, c, out, flip) {
  const cx = c.wx, cy = c.wy, r = c.r;
  let best = 0, maxSep = -1e9;
  for (let i = 0; i < p.n; i++) {
    const s = p.wn[2 * i] * (cx - p.wv[2 * i]) + p.wn[2 * i + 1] * (cy - p.wv[2 * i + 1]);
    if (s > r) return 0;
    if (s > maxSep) { maxSep = s; best = i; }
  }
  const j = (best + 1) % p.n;
  const v1x = p.wv[2 * best], v1y = p.wv[2 * best + 1], v2x = p.wv[2 * j], v2y = p.wv[2 * j + 1];
  let nx, ny, px, py, pen;
  if (maxSep < 1e-9) {
    nx = p.wn[2 * best]; ny = p.wn[2 * best + 1]; pen = r - maxSep; px = cx - nx * r; py = cy - ny * r;
  } else {
    const u1 = (cx - v1x) * (v2x - v1x) + (cy - v1y) * (v2y - v1y);
    const u2 = (cx - v2x) * (v1x - v2x) + (cy - v2y) * (v1y - v2y);
    if (u1 <= 0) {
      const d = Math.hypot(cx - v1x, cy - v1y); if (d > r) return 0;
      nx = (cx - v1x) / (d || 1); ny = (cy - v1y) / (d || 1); pen = r - d; px = v1x; py = v1y;
    } else if (u2 <= 0) {
      const d = Math.hypot(cx - v2x, cy - v2y); if (d > r) return 0;
      nx = (cx - v2x) / (d || 1); ny = (cy - v2y) / (d || 1); pen = r - d; px = v2x; py = v2y;
    } else {
      nx = p.wn[2 * best]; ny = p.wn[2 * best + 1]; pen = r - maxSep; px = cx - nx * r; py = cy - ny * r;
    }
  }
  if (flip) { nx = -nx; ny = -ny; }
  out.nx = nx; out.ny = ny; out.pts.push(px, py, pen);
  return 1;
}

function collideCircles(a, b, out) {
  const dx = b.wx - a.wx, dy = b.wy - a.wy, d = Math.hypot(dx, dy), r = a.r + b.r;
  if (d > r) return 0;
  const nx = d > 1e-9 ? dx / d : 1, ny = d > 1e-9 ? dy / d : 0;
  out.nx = nx; out.ny = ny;
  out.pts.push(a.wx + nx * a.r, a.wy + ny * a.r, r - d);
  return 1;
}

export function collideShapes(sa, sb, out) {
  out.pts.length = 0;
  if (sa.type === 0 && sb.type === 0) return collidePolys(sa, sb, out);
  if (sa.type === 0 && sb.type === 1) return collidePolyCircle(sa, sb, out, false);
  if (sa.type === 1 && sb.type === 0) return collidePolyCircle(sb, sa, out, true);
  return collideCircles(sa, sb, out);
}

// ------------------------------------------------------- consultas de raio
// raio 2D contra uma forma; devolve distância t (m) ou Infinity
export const rayHit = { nx: 0, ny: 0, curved: false };
export function rayShape(sh, ox, oy, dx, dy, maxT) {
  if (sh.type === 1) {
    const fx = ox - sh.wx, fy = oy - sh.wy;
    const b = fx * dx + fy * dy, c = fx * fx + fy * fy - sh.r * sh.r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t <= maxT) { rayHit.nx = (ox + dx * t - sh.wx) / sh.r; rayHit.ny = (oy + dy * t - sh.wy) / sh.r; rayHit.curved = true; return t; }
    return Infinity;
  }
  let tmin = Infinity;
  for (let i = 0; i < sh.n; i++) {
    const j = (i + 1) % sh.n;
    const ax = sh.wv[2 * i], ay = sh.wv[2 * i + 1], bx = sh.wv[2 * j], by = sh.wv[2 * j + 1];
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / den;
    if (t >= 0 && t <= maxT && u >= 0 && u <= 1 && t < tmin) { tmin = t; rayHit.nx = sh.wn[2 * i]; rayHit.ny = sh.wn[2 * i + 1]; rayHit.curved = false; }
  }
  return tmin;
}

export function pointInShape(sh, px, py) {
  if (sh.type === 1) return (px - sh.wx) ** 2 + (py - sh.wy) ** 2 <= sh.r * sh.r;
  for (let i = 0; i < sh.n; i++) {
    if (sh.wn[2 * i] * (px - sh.wv[2 * i]) + sh.wn[2 * i + 1] * (py - sh.wv[2 * i + 1]) > 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------- mundo
export class World {
  constructor() {
    this.bodies = [];
    this.joints = [];
    this.contacts = [];
    this.iterations = 10;
    this.t = 0;
    this.robot = null;          // objeto com preSolve/solve/postStep (robot.js)
    this._man = { nx: 0, ny: 0, pts: [] };
    this.impulseLog = [];       // impulsos de contato do passo (para sensores e gestos)
    this.filter = null;         // (sa, sb, A, B) => bool
  }
  add(b) { this.bodies.push(b); updateBodyShapes(b); return b; }
  remove(b) {
    const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1);
    this.joints = this.joints.filter(j => j.a !== b && j.b !== b);
  }
  addJoint(j) { this.joints.push(j); return j; }

  // ------------------------------------------------------------ detecção
  findContacts() {
    const C = this.contacts; C.length = 0;
    const bs = this.bodies, man = this._man;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        if (A.im === 0 && B.im === 0 && A.iI === 0 && B.iI === 0) continue;
        if (A.group && A.group === B.group) continue;
        for (const sa of A.shapes) {
          if (sa.off) continue;
          const az0 = sa.z0 + A.lift, az1 = sa.z1 + A.lift;
          for (const sb of B.shapes) {
            if (sb.off) continue;
            if (sa.maxX < sb.minX || sb.maxX < sa.minX || sa.maxY < sb.minY || sb.maxY < sa.minY) continue;
            const bz0 = sb.z0 + B.lift, bz1 = sb.z1 + B.lift;
            if (az1 <= bz0 || bz1 <= az0) continue;
            if (this.filter && !this.filter(sa, sb, A, B)) continue;
            const n = collideShapes(sa, sb, man);
            if (!n) continue;
            if (sa.sensor || sb.sensor) {
              C.push({ A, B, sa, sb, sensorOnly: true, nx: man.nx, ny: man.ny, pts: [] });
              continue;
            }
            const mu = Math.sqrt(sa.mu * sb.mu), e = Math.max(sa.e, sb.e);
            const pts = [];
            for (let k = 0; k < n; k++) {
              pts.push({ px: man.pts[3 * k], py: man.pts[3 * k + 1], pen: man.pts[3 * k + 2],
                rAx: 0, rAy: 0, rBx: 0, rBy: 0, mN: 0, mT: 0, bias: 0, lN: 0, lT: 0 });
            }
            C.push({ A, B, sa, sb, nx: man.nx, ny: man.ny, mu, e, pts, sensorOnly: false });
          }
        }
      }
    }
  }

  prepareContacts(dt) {
    for (const c of this.contacts) {
      if (c.sensorOnly) continue;
      const A = c.A, B = c.B, nx = c.nx, ny = c.ny, tx = ny, ty = -nx;
      for (const p of c.pts) {
        p.rAx = p.px - A.x; p.rAy = p.py - A.y; p.rBx = p.px - B.x; p.rBy = p.py - B.y;
        const rnA = p.rAx * ny - p.rAy * nx, rnB = p.rBx * ny - p.rBy * nx;
        const rtA = p.rAx * ty - p.rAy * tx, rtB = p.rBx * ty - p.rBy * tx;
        const kN = A.im + B.im + A.iI * rnA * rnA + B.iI * rnB * rnB;
        const kT = A.im + B.im + A.iI * rtA * rtA + B.iI * rtB * rtB;
        p.mN = kN > 0 ? 1 / kN : 0; p.mT = kT > 0 ? 1 / kT : 0;
        const dvx = B.vx - B.w * p.rBy - A.vx + A.w * p.rAy;
        const dvy = B.vy + B.w * p.rBx - A.vy - A.w * p.rAx;
        const vn = dvx * nx + dvy * ny;
        let target = Math.min(MAX_BIAS_V, BAUMGARTE / dt * Math.max(0, p.pen - LINEAR_SLOP));
        if (vn < -0.15) target = Math.max(target, -c.e * vn);
        p.bias = target; p.lN = 0; p.lT = 0;
      }
    }
  }

  solveContacts() {
    for (const c of this.contacts) {
      if (c.sensorOnly) continue;
      const A = c.A, B = c.B, nx = c.nx, ny = c.ny, tx = ny, ty = -nx;
      for (const p of c.pts) {
        // atrito tangencial
        let dvx = B.vx - B.w * p.rBy - A.vx + A.w * p.rAy;
        let dvy = B.vy + B.w * p.rBx - A.vy - A.w * p.rAx;
        const vt = dvx * tx + dvy * ty;
        let dl = -vt * p.mT;
        const maxF = c.mu * p.lN;
        const nlT = Math.max(-maxF, Math.min(maxF, p.lT + dl));
        dl = nlT - p.lT; p.lT = nlT;
        let Px = tx * dl, Py = ty * dl;
        A.vx -= Px * A.im; A.vy -= Py * A.im; A.w -= (p.rAx * Py - p.rAy * Px) * A.iI;
        B.vx += Px * B.im; B.vy += Py * B.im; B.w += (p.rBx * Py - p.rBy * Px) * B.iI;
        // normal
        dvx = B.vx - B.w * p.rBy - A.vx + A.w * p.rAy;
        dvy = B.vy + B.w * p.rBx - A.vy - A.w * p.rAx;
        const vn = dvx * nx + dvy * ny;
        dl = p.mN * (p.bias - vn);
        const nlN = Math.max(0, p.lN + dl);
        dl = nlN - p.lN; p.lN = nlN;
        Px = nx * dl; Py = ny * dl;
        A.vx -= Px * A.im; A.vy -= Py * A.im; A.w -= (p.rAx * Py - p.rAy * Px) * A.iI;
        B.vx += Px * B.im; B.vy += Py * B.im; B.w += (p.rBx * Py - p.rBy * Px) * B.iI;
      }
    }
  }

  // atrito com o tapete (junta de atrito top-down)
  prepareGround(dt) {
    for (const b of this.bodies) {
      if (b.kind !== 'dynamic' || !b.ground || b.lift > 0.001) continue;
      b.lamLin[0] = b.lamLin[1] = 0; b.lamAng = 0;
      b._maxLin = b.groundMu * b.m * G * dt;
      b._maxAng = b.groundMu * b.m * G * b.groundR * dt;
    }
  }
  solveGround() {
    for (const b of this.bodies) {
      if (b.kind !== 'dynamic' || !b.ground || b.lift > 0.001) continue;
      // angular
      let dl = -b.w * b.I;
      let nl = Math.max(-b._maxAng, Math.min(b._maxAng, b.lamAng + dl));
      dl = nl - b.lamAng; b.lamAng = nl; b.w += dl * b.iI;
      // linear
      let px = -b.vx * b.m, py = -b.vy * b.m;
      let ax = b.lamLin[0] + px, ay = b.lamLin[1] + py;
      const L = Math.hypot(ax, ay);
      if (L > b._maxLin) { ax *= b._maxLin / L; ay *= b._maxLin / L; }
      px = ax - b.lamLin[0]; py = ay - b.lamLin[1];
      b.lamLin[0] = ax; b.lamLin[1] = ay;
      b.vx += px * b.im; b.vy += py * b.im;
    }
  }

  step(dt) {
    const bs = this.bodies;
    // forças externas (molas das juntas, torques de motores etc.)
    for (const j of this.joints) if (j.applyForces) j.applyForces(dt);
    if (this.robot) this.robot.applyForces(dt);
    for (const b of bs) {
      if (b.kind !== 'dynamic') continue;
      b.vx += b.fx * b.im * dt; b.vy += b.fy * b.im * dt; b.w += b.tq * b.iI * dt;
      b.fx = b.fy = b.tq = 0;
    }
    for (const b of bs) updateBodyShapes(b);
    this.findContacts();
    this.prepareContacts(dt);
    this.prepareGround(dt);
    for (const j of this.joints) j.prepare(dt);
    if (this.robot) this.robot.prepare(dt);
    for (let it = 0; it < this.iterations; it++) {
      for (const j of this.joints) j.solve(dt);
      if (this.robot) this.robot.solve(dt);
      this.solveContacts();
      this.solveGround();
    }
    // registro de impulsos (sensor de força, gestos, toques)
    const log = this.impulseLog; log.length = 0;
    for (const c of this.contacts) {
      let s = 0; for (const p of c.pts) s += p.lN;
      log.push(c, s);
    }
    // integração
    for (const b of bs) {
      if (b.kind === 'static') continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
    }
    if (this.robot) this.robot.postStep(dt);
    this.t += dt;
  }
}

// ---------------------------------------------------------------- juntas
// Pivô fixo no mundo (alavancas, portas). Ângulo relativo a a0, com limites,
// mola de torção e atrito de rotação.
export function worldPivot(b, wx, wy, o = {}) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a);
  const lx = c * (wx - b.x) - s * (wy - b.y), ly = s * (wx - b.x) + c * (wy - b.y);
  const j = {
    kind: 'pivot', b, lx, ly, px: wx, py: wy, a0: b.a,
    lower: o.lower ?? -Infinity, upper: o.upper ?? Infinity,
    k: o.k || 0, rest: o.rest || 0, damp: o.damp || 0, fricT: o.fricT || 0,
    rx: 0, ry: 0, K: [0, 0, 0], lamF: 0, bias: [0, 0], limState: 0, limBias: 0, lamLim: 0,
    angle() { return b.a - this.a0; },
    applyForces() {
      const th = b.a - this.a0;
      if (this.k) b.tq += -this.k * (th - this.rest);
      if (this.damp) b.tq += -this.damp * b.w;
    },
    prepare(dt) {
      const cc = Math.cos(b.a), ss = Math.sin(b.a);
      this.rx = cc * this.lx - ss * this.ly; this.ry = ss * this.lx + cc * this.ly;
      const im = b.im, iI = b.iI, rx = this.rx, ry = this.ry;
      const k11 = im + iI * ry * ry, k12 = -iI * rx * ry, k22 = im + iI * rx * rx;
      const det = k11 * k22 - k12 * k12;
      this.K = det ? [k22 / det, -k12 / det, k11 / det] : [0, 0, 0];
      const cx = b.x + rx - this.px, cy = b.y + ry - this.py;
      const f = BAUMGARTE / dt;
      this.bias = [clampV(-f * cx), clampV(-f * cy)];
      const th = b.a - this.a0;
      this.limState = th <= this.lower ? -1 : (th >= this.upper ? 1 : 0);
      this.limBias = this.limState === -1 ? clampV(f * (this.lower - th)) : (this.limState === 1 ? clampV(f * (this.upper - th)) : 0);
      this.lamLim = 0; this.lamF = 0; this._maxF = this.fricT * dt;
    },
    solve() {
      if (b.kind !== 'dynamic') return;
      // atrito de rotação
      if (this._maxF > 0) {
        let dl = -b.w * b.I;
        const nl = Math.max(-this._maxF, Math.min(this._maxF, this.lamF + dl));
        dl = nl - this.lamF; this.lamF = nl; b.w += dl * b.iI;
      }
      // limites
      if (this.limState) {
        let dl = (this.limBias - b.w) * b.I;
        let nl = this.lamLim + dl;
        nl = this.limState === -1 ? Math.max(0, nl) : Math.min(0, nl);
        dl = nl - this.lamLim; this.lamLim = nl; b.w += dl * b.iI;
      }
      // ponto
      const vx = b.vx - b.w * this.ry, vy = b.vy + b.w * this.rx;
      const ex = this.bias[0] - vx, ey = this.bias[1] - vy;
      const Px = this.K[0] * ex + this.K[1] * ey, Py = this.K[1] * ex + this.K[2] * ey;
      b.vx += Px * b.im; b.vy += Py * b.im; b.w += (this.rx * Py - this.ry * Px) * b.iI;
    },
  };
  return j;
}

// Trilho fixo no mundo (portões, empurradores): translação só ao longo de u,
// sem rotação, com limites e mola.
export function worldSlider(b, ux, uy, o = {}) {
  const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  const j = {
    kind: 'slider', b, ux, uy, x0: b.x, y0: b.y, a0: b.a,
    lower: o.lower ?? -Infinity, upper: o.upper ?? Infinity, k: o.k || 0, rest: o.rest || 0,
    damp: o.damp || 0, fric: o.fric || 0, lamF: 0, limState: 0, limBias: 0, lamLim: 0, pBias: 0, aBias: 0,
    pos() { return (b.x - this.x0) * this.ux + (b.y - this.y0) * this.uy; },
    applyForces() {
      const s = this.pos();
      let F = 0;
      if (this.k) F += -this.k * (s - this.rest);
      if (this.damp) F += -this.damp * (b.vx * this.ux + b.vy * this.uy);
      b.fx += F * this.ux; b.fy += F * this.uy;
    },
    prepare(dt) {
      const f = BAUMGARTE / dt;
      const nx = -this.uy, ny = this.ux;
      const perp = (b.x - this.x0) * nx + (b.y - this.y0) * ny;
      this.pBias = clampV(-f * perp);
      this.aBias = clampV(-f * (b.a - this.a0));
      const s = this.pos();
      this.limState = s <= this.lower ? -1 : (s >= this.upper ? 1 : 0);
      this.limBias = this.limState === -1 ? clampV(f * (this.lower - s)) : (this.limState === 1 ? clampV(f * (this.upper - s)) : 0);
      this.lamLim = 0; this.lamF = 0; this._maxF = this.fric * dt;
    },
    solve() {
      if (b.kind !== 'dynamic') return;
      const nx = -this.uy, ny = this.ux;
      b.w += (this.aBias - b.w); // sem rotação
      const vp = b.vx * nx + b.vy * ny;
      const d = this.pBias - vp; b.vx += d * nx; b.vy += d * ny;
      const va = b.vx * this.ux + b.vy * this.uy;
      if (this._maxF > 0) {
        let dl = -va * b.m;
        const nl = Math.max(-this._maxF, Math.min(this._maxF, this.lamF + dl));
        dl = nl - this.lamF; this.lamF = nl;
        b.vx += dl * b.im * this.ux; b.vy += dl * b.im * this.uy;
      }
      if (this.limState) {
        const v = b.vx * this.ux + b.vy * this.uy;
        let dl = (this.limBias - v) * b.m;
        let nl = this.lamLim + dl;
        nl = this.limState === -1 ? Math.max(0, nl) : Math.min(0, nl);
        dl = nl - this.lamLim; this.lamLim = nl;
        b.vx += dl * b.im * this.ux; b.vy += dl * b.im * this.uy;
      }
    },
  };
  return j;
}

// Articulação entre dois corpos dinâmicos (robô e braço lateral).
export function revolute(A, B, wx, wy, o = {}) {
  const loc = (b) => {
    const c = Math.cos(-b.a), s = Math.sin(-b.a);
    return [c * (wx - b.x) - s * (wy - b.y), s * (wx - b.x) + c * (wy - b.y)];
  };
  const [ax, ay] = loc(A), [bx, by] = loc(B);
  const j = {
    kind: 'revolute', a: A, b: B, ax, ay, bx, by, ref: B.a - A.a,
    lower: o.lower ?? -Infinity, upper: o.upper ?? Infinity,
    rA: [0, 0], rB: [0, 0], K: [0, 0, 0], bias: [0, 0], limState: 0, limBias: 0, lamLim: 0, kA: 0,
    angle() { return B.a - A.a - this.ref; },
    prepare(dt) {
      const ca = Math.cos(A.a), sa = Math.sin(A.a), cb = Math.cos(B.a), sb = Math.sin(B.a);
      const rA = [ca * this.ax - sa * this.ay, sa * this.ax + ca * this.ay];
      const rB = [cb * this.bx - sb * this.by, sb * this.bx + cb * this.by];
      this.rA = rA; this.rB = rB;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      const k11 = mA + mB + iA * rA[1] * rA[1] + iB * rB[1] * rB[1];
      const k12 = -iA * rA[0] * rA[1] - iB * rB[0] * rB[1];
      const k22 = mA + mB + iA * rA[0] * rA[0] + iB * rB[0] * rB[0];
      const det = k11 * k22 - k12 * k12;
      this.K = det ? [k22 / det, -k12 / det, k11 / det] : [0, 0, 0];
      const f = BAUMGARTE / dt;
      const cx = B.x + rB[0] - A.x - rA[0], cy = B.y + rB[1] - A.y - rA[1];
      this.bias = [clampV(-f * cx), clampV(-f * cy)];
      const th = this.angle();
      this.limState = th <= this.lower ? -1 : (th >= this.upper ? 1 : 0);
      this.limBias = this.limState === -1 ? clampV(f * (this.lower - th)) : (this.limState === 1 ? clampV(f * (this.upper - th)) : 0);
      this.lamLim = 0;
      this.kA = (iA + iB) > 0 ? 1 / (iA + iB) : 0;
    },
    solve() {
      if (this.limState) {
        let dl = (this.limBias - (B.w - A.w)) * this.kA;
        let nl = this.lamLim + dl;
        nl = this.limState === -1 ? Math.max(0, nl) : Math.min(0, nl);
        dl = nl - this.lamLim; this.lamLim = nl;
        A.w -= dl * A.iI; B.w += dl * B.iI;
      }
      const rA = this.rA, rB = this.rB;
      const vx = B.vx - B.w * rB[1] - A.vx + A.w * rA[1];
      const vy = B.vy + B.w * rB[0] - A.vy - A.w * rA[0];
      const ex = this.bias[0] - vx, ey = this.bias[1] - vy;
      const Px = this.K[0] * ex + this.K[1] * ey, Py = this.K[1] * ex + this.K[2] * ey;
      A.vx -= Px * A.im; A.vy -= Py * A.im; A.w -= (rA[0] * Py - rA[1] * Px) * A.iI;
      B.vx += Px * B.im; B.vy += Py * B.im; B.w += (rB[0] * Py - rB[1] * Px) * B.iI;
    },
  };
  return j;
}

function clampV(v) { return v > MAX_BIAS_V ? MAX_BIAS_V : (v < -MAX_BIAS_V ? -MAX_BIAS_V : v); }
