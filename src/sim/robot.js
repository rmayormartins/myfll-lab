// ============================================================================
//  MyFLL.lab :: robot.js
//  O robô físico: corpo rígido montado a partir do layout, rodas com atrito de
//  pneu (restrição de rolamento com cone de Coulomb), rodízios, transferência de
//  carga, graus de liberdade dos motores (rodas, braço frontal, braço lateral,
//  motor livre) e peças sensoras. A lógica de controle fica no hub (hub.js).
// ============================================================================
import { makeBody, polyShape, circleShape, boxPts, setKind, revolute, updateBodyShapes, pointInShape, G } from './physics.js';
import { layoutRobot, MOTORS, WHEELS, CASTERS } from '../common/catalog.js';
import { clamp, DEG } from '../common/rng.js';

export const VNOM = 8.0;
export const ROBOT_GROUP = 7;
const ARM_HT = 0.004;   // meia espessura do braço frontal (viga de 8 mm)
const MM = 0.001;

export function motorTorque(spec, vr, out, w, V) {
  if (!out || out.mode === 'coast') return 0;
  const wnl = spec.nl * DEG;
  const ts = spec.stall * vr.kT;
  if (out.mode === 'brake') return -ts * w / wnl;
  const d = clamp(out.duty, -1, 1);
  return ts * (d * V / VNOM - w / wnl);
}

// atrito interno do motor como impulso limitado (evita trepidação em ω ≈ 0)
function frictionImpulse(omega, J, fc, fv, dt) {
  omega -= omega * Math.min(1, fv * dt / J);
  const d = fc * dt / J;
  if (Math.abs(omega) <= d) return 0;
  return omega - Math.sign(omega) * d;
}

export class Robot {
  constructor(world, cfg, opts = {}) {
    this.world = world;
    this.cfg = cfg;
    this.rng = opts.rng || Math.random;
    this.realism = opts.realism ?? 1;
    this.hub = null;              // ligado depois (hub.js)
    this.grounded = true;
    this.dofs = {};               // porta -> grau de liberdade
    this.build(opts.pose || { x: 0.3, y: 0.2, a: 0 });
    world.robot = this;
  }

  // ------------------------------------------------------------ montagem
  build(pose) {
    const cfg = this.cfg, W = this.world;
    const L = layoutRobot(cfg);
    this.layout = L;
    const [cx, cy, cz] = L.com;
    this.com = [cx * MM, cy * MM, cz * MM];
    const r = this.rng, R = this.realism;
    const N = () => r.normal ? r.normal() : 0;

    const shapes = [];
    this.sensorShapes = {};
    for (const p of L.parts) {
      if (!p.collide) continue;
      if (p.kind === 'wheel') {
        const s = polyShape(boxPts(p.w * MM, p.d * MM, (p.x - cx) * MM, (p.y - cy) * MM), { z0: 0, z1: p.h * MM, mu: 0.8, e: 0.05, tag: 'wheel' });
        shapes.push(s);
        continue;
      }
      const z0 = (p.z - p.h / 2) * MM, z1 = (p.z + p.h / 2) * MM;
      const ang = (p.rot || 0) * DEG;
      const s = polyShape(boxPts(p.w * MM, p.d * MM, (p.x - cx) * MM, (p.y - cy) * MM, ang), { z0, z1, mu: 0.35, e: 0.1, tag: p.kind });
      shapes.push(s);
      if (p.kind === 'force') {
        const dir = (p.rot || 0) * DEG;
        const tx = p.x + Math.cos(dir) * (p.w / 2 + 5), ty = p.y + Math.sin(dir) * (p.w / 2 + 5);
        const tip = circleShape((tx - cx) * MM, (ty - cy) * MM, 0.006, { z0: (p.z - 7) * MM, z1: (p.z + 7) * MM, mu: 0.5, e: 0.05, tag: 'force:' + p.port });
        shapes.push(tip);
        this.sensorShapes['force:' + p.port] = tip;
      }
    }
    // braço frontal: 3 segmentos com faixa de altura variável
    this.lifts = [];
    for (const p of L.parts) {
      if (p.kind !== 'lift') continue;
      const a = p.att;
      const segs = [];
      for (let k = 0; k < 3; k++) {
        const s = polyShape(boxPts(0.02, a.width * MM), { z0: 0, z1: 0.01, mu: 0.4, e: 0.05, tag: 'lift' });
        segs.push(s); shapes.push(s);
      }
      const spec = MOTORS[a.motor] || MOTORS.medium;
      const mArm = p.mass;
      const Lm = a.length * MM;
      const gear = a.gear || 1;
      const lift = {
        kind: 'lift', port: a.port, att: a, spec, segs, gear, dir: a.dir || 1,
        px: (a.x - cx) * MM, py: (a.y - cy) * MM, pz: a.z * MM, L: Lm, W: a.width * MM,
        m: mArm, I: mArm * Lm * Lm / 3 + spec.J * gear * gear,
        alpha: (a.start ?? 60) * DEG, omega: 0,
        min: (a.min ?? -40) * DEG, max: (a.max ?? 85) * DEG,
        hooked: null, hookOff: [0, 0], restOn: null, pressF: 0, tipW: [0, 0, 0], prevTipZ: 0, blocked: 0,
        vr: { kT: 1 + 0.03 * R * N(), kF: 1 + 0.1 * R * N() }, motor: null,
      };
      lift.pos = () => lift.alpha * lift.gear * lift.dir;         // rad no eixo do motor
      lift.vel = () => lift.omega * lift.gear * lift.dir;
      this.lifts.push(lift);
      this.dofs[a.port] = lift;
    }

    const body = makeBody({ kind: 'dynamic', x: 0, y: 0, a: pose.a, m: L.mass, group: ROBOT_GROUP, ground: false, autoMass: false, tag: 'robot' });
    body.shapes = shapes;
    body.m = L.mass; body.I = L.I; setKind(body, 'dynamic');
    this.body = body;
    this.setPose(pose.x, pose.y, pose.a);
    W.add(body);

    // rodas motrizes
    const wh = WHEELS[cfg.drive.wheel] || WHEELS.spike56;
    const dm = MOTORS[cfg.drive.motor] || MOTORS.large;
    this.wheels = [];
    for (const p of L.parts) {
      if (p.kind !== 'wheel') continue;
      const side = p.side; // +1 esquerda, -1 direita
      const dErr = 1 + 0.0018 * R * N();  // diferença de fabricação do diâmetro/pneu
      const w = {
        kind: 'wheel', side, port: p.port, spec: dm,
        rx: (p.x - cx) * MM, ry: (p.y - cy) * MM,
        R: wh.d / 2 * MM * dErr, J: dm.J + wh.mass * (wh.d / 2 * MM) ** 2 / 2,
        mu: wh.mu * (1 + 0.03 * R * N()), omega: 0, angle: 0, N: 0,
        sgn: side > 0 ? -1 : 1,  // motor voltado para fora: esquerda gira anti-horário para frente
        lt: 0, ln: 0, Kt: 0, Kn: 0, wx: 0, wy: 0, tx: 0, ty: 0,
        vr: { kT: 1 + 0.03 * R * N(), kF: 1 + 0.1 * R * N() }, motor: null,
      };
      w.pos = () => w.sgn * w.angle;
      w.vel = () => w.sgn * w.omega;
      this.wheels.push(w);
      this.dofs[p.port] = w;
    }
    this.casters = [];
    for (const p of L.parts) {
      if (p.kind !== 'caster') continue;
      const cs = CASTERS[p.type] || CASTERS.ball;
      this.casters.push({ rx: (p.x - cx) * MM, ry: (p.y - cy) * MM, mu: cs.mu, N: 0, lx: 0, ly: 0, wx: 0, wy: 0 });
    }
    this.hcom = cz * MM;

    // braço lateral: corpo próprio + articulação com motor
    this.sweeps = [];
    for (const p of L.parts) {
      if (p.kind !== 'sweep') continue;
      const a = p.att;
      const spec = MOTORS[a.motor] || MOTORS.medium;
      const Lm = a.length * MM, gear = a.gear || 1;
      const start = (a.start || 0) * DEG;
      const bar = polyShape(boxPts(Lm, 0.012, Lm / 2, 0), { z0: (a.z - 8) * MM, z1: (a.z + 8) * MM, mu: 0.4, e: 0.05, tag: 'sweep' });
      const hubS = circleShape(0, 0, 0.01, { z0: (a.z - 8) * MM, z1: (a.z + 8) * MM, tag: 'sweep' });
      const arm = makeBody({ kind: 'dynamic', x: 0, y: 0, a: 0, m: p.mass, group: ROBOT_GROUP, ground: false, autoMass: false, tag: 'sweep' });
      arm.shapes = [bar, hubS];
      arm.m = p.mass; arm.I = p.mass * Lm * Lm / 3 + spec.J * gear * gear; setKind(arm, 'dynamic');
      const sw = { kind: 'sweep', port: a.port, att: a, spec, gear, dir: a.dir || 1, body: arm, lx: a.x * MM, ly: a.y * MM, joint: null,
        vr: { kT: 1 + 0.03 * R * N(), kF: 1 + 0.1 * R * N() }, motor: null, start };
      this._placeSweep(sw, start);
      W.add(arm);
      sw.joint = W.addJoint(revolute(body, arm, arm.x, arm.y));
      sw.joint.ref = start;  // ângulo zero do motor = posição de montagem
      sw.pos = () => sw.joint.angle() * sw.gear * sw.dir;
      sw.vel = () => (arm.w - body.w) * sw.gear * sw.dir;
      this.sweeps.push(sw);
      this.dofs[a.port] = sw;
    }
    // motores soltos (sem acessório): rotor com pequena carga
    this.frees = [];
    for (const p of L.parts) {
      if (p.kind !== 'motor' || p.role !== 'free') continue;
      const spec = MOTORS[p.motor] || MOTORS.medium;
      const f = { kind: 'free', port: p.port, spec, J: spec.J * 1.3, angle: 0, omega: 0,
        vr: { kT: 1 + 0.03 * R * N(), kF: 1 + 0.1 * R * N() }, motor: null };
      f.pos = () => f.angle; f.vel = () => f.omega;
      this.frees.push(f);
      this.dofs[p.port] = f;
    }
    // estado para IMU
    this.acc = [0, 0];   // aceleração no referencial do corpo (m/s²)
    this._pv = [0, 0, 0];
    this.forceN = {};
    this.touching = new Set();
    this.bumpImpulse = 0;
    for (const lf of this.lifts) this._updateLiftShapes(lf);
    updateBodyShapes(body);
  }

  _placeSweep(sw, relAngle) {
    const b = this.body, c = Math.cos(b.a), s = Math.sin(b.a);
    const [cx, cy] = this.com;
    const lx = sw.lx - cx, ly = sw.ly - cy;
    sw.body.x = b.x + c * lx - s * ly; sw.body.y = b.y + s * lx + c * ly;
    sw.body.a = b.a + relAngle;
    sw.body.vx = b.vx; sw.body.vy = b.vy; sw.body.w = b.w;
  }

  destroy() {
    if (this.world.robot === this) this.world.robot = null;
    this.world.remove(this.body);
    for (const sw of this.sweeps) this.world.remove(sw.body);
  }

  // pose: origem no eixo das rodas (m, rad)
  setPose(x, y, a) {
    const b = this.body, [cx, cy] = this.com;
    const c = Math.cos(a), s = Math.sin(a);
    b.a = a; b.x = x + c * cx - s * cy; b.y = y + s * cx + c * cy;
    b.vx = b.vy = b.w = 0;
    if (this.sweeps) for (const sw of this.sweeps) {
      const rel = sw.joint ? sw.joint.angle() : sw.start;
      this._placeSweep(sw, rel + (sw.joint ? sw.joint.ref : 0));
      sw.body.vx = sw.body.vy = sw.body.w = 0;
    }
    if (this.wheels) for (const w of this.wheels) w.omega = 0;
    updateBodyShapes(b);
  }
  pose() {
    const b = this.body, [cx, cy] = this.com;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    return { x: b.x - (c * cx - s * cy), y: b.y - (s * cx + c * cy), a: b.a };
  }
  toWorld(lx, ly) { // mm no referencial do robô -> m no mundo
    const b = this.body, [cx, cy] = this.com;
    const X = lx * MM - cx, Y = ly * MM - cy, c = Math.cos(b.a), s = Math.sin(b.a);
    return [b.x + c * X - s * Y, b.y + s * X + c * Y];
  }
  voltage() { return this.hub ? this.hub.battery.V : VNOM; }

  // ------------------------------------------------------------ forças
  applyForces(dt) {
    const V = this.voltage();
    let Iload = 0;
    for (const w of this.wheels) {
      const m = w.motor;
      const wm = w.sgn * w.omega;
      const tq = motorTorque(w.spec, w.vr, m && m.out, wm, V);
      Iload += Math.abs(tq) / (w.spec.stall / w.spec.Istall) * (m && m.out.mode === 'duty' ? 1 : 0);
      w.omega += w.sgn * tq / w.J * dt;
      const om = frictionImpulse(w.omega, w.J, w.spec.fc * w.vr.kF + 0.004 * w.N * w.R, w.spec.fv, dt);
      w.omega = om;
    }
    for (const lf of this.lifts) {
      const m = lf.motor;
      const wm = lf.vel();
      const tq = motorTorque(lf.spec, lf.vr, m && m.out, wm, V);
      Iload += Math.abs(tq) / (lf.spec.stall / lf.spec.Istall) * (m && m.out.mode === 'duty' ? 1 : 0);
      const ta = tq * lf.gear * lf.dir;
      const hookM = lf.hooked ? lf.hooked.m : 0;
      const tg = -(lf.m * G * lf.L / 2 + hookM * G * lf.L) * Math.cos(lf.alpha);
      lf.omega += (ta + tg) / lf.I * dt;
      lf.omega = frictionImpulse(lf.omega, lf.I, lf.spec.fc * lf.vr.kF * lf.gear, lf.spec.fv * lf.gear * lf.gear, dt);
      let na = lf.alpha + lf.omega * dt;
      const floor = this._liftFloor(lf);
      lf.restOn = null; lf.pressF = 0; lf.blocked = 0;
      const lo = Math.max(lf.min, floor.a);
      if (na < lo) {
        if (floor.a > lf.min) { lf.restOn = floor.obj; lf.pressF = Math.max(0, -(ta + tg)) / Math.max(0.02, lf.L * Math.cos(lo)); }
        na = lo; if (lf.omega < 0) lf.omega = 0; lf.blocked = -1;
      }
      if (na > lf.max) { na = lf.max; if (lf.omega > 0) lf.omega = 0; lf.blocked = 1; }
      lf.alpha = na;
    }
    for (const sw of this.sweeps) {
      const m = sw.motor;
      const tq = motorTorque(sw.spec, sw.vr, m && m.out, sw.vel(), V);
      Iload += Math.abs(tq) / (sw.spec.stall / sw.spec.Istall) * (m && m.out.mode === 'duty' ? 1 : 0);
      const ta = tq * sw.gear * sw.dir;
      sw.body.tq += ta; this.body.tq -= ta;
      // atrito interno como amortecimento relativo
      const rel = sw.body.w - this.body.w;
      const fr = frictionImpulse(rel, sw.body.I, sw.spec.fc * sw.vr.kF * sw.gear, sw.spec.fv * sw.gear * sw.gear, dt);
      const Lf = (fr - rel) / (1 / sw.body.I + 1 / this.body.I);
      sw.body.w += Lf / sw.body.I; this.body.w -= Lf / this.body.I;
    }
    for (const f of this.frees) {
      const m = f.motor;
      const tq = motorTorque(f.spec, f.vr, m && m.out, f.omega, V);
      Iload += Math.abs(tq) / (f.spec.stall / f.spec.Istall) * (m && m.out.mode === 'duty' ? 1 : 0);
      f.omega += tq / f.J * dt;
      f.omega = frictionImpulse(f.omega, f.J, f.spec.fc * f.vr.kF, f.spec.fv, dt);
      f.angle += f.omega * dt;
    }
    this.motorCurrent = Iload;
  }

  // chão efetivo do braço frontal (tapete ou topo de um objeto sob a ponta)
  _liftFloor(lf) {
    const b = this.body, c = Math.cos(b.a), s = Math.sin(b.a);
    let best = { a: Math.asin(clamp((ARM_HT + 0.0005 - lf.pz) / lf.L, -1, 1)), obj: null };
    const sa = Math.sin(lf.alpha), ca = Math.cos(lf.alpha);
    // pontos ao longo do braço (1/3, 2/3 e ponta) e na largura
    for (let q = 1; q <= 3; q++) {
      const sl = lf.L * q / 3;
      const zq = lf.pz + sl * sa;
      const lx = lf.px + sl * ca;
      for (let k = -1; k <= 1; k++) {
        const ly = lf.py + k * lf.W * 0.4;
        const wx = b.x + c * lx - s * ly, wy = b.y + s * lx + c * ly;
        for (const o of this.world.bodies) {
          if (o.group === ROBOT_GROUP || o === lf.hooked) continue;
          for (const sh of o.shapes) {
            const top = sh.z1 + o.lift;
            if (top > zq + 0.003) continue;
            if (sh.maxX < wx || sh.minX > wx || sh.maxY < wy || sh.minY > wy) continue;
            if (!pointInShape(sh, wx, wy)) continue;
            const a = Math.asin(clamp((top + ARM_HT + 0.0005 - lf.pz) / sl, -1, 1));
            if (a > best.a) best = { a, obj: o };
          }
        }
      }
    }
    return best;
  }

  _updateLiftShapes(lf) {
    const ca = Math.cos(lf.alpha), sa = Math.sin(lf.alpha);
    for (let k = 0; k < 3; k++) {
      const s0 = lf.L * k / 3, s1 = lf.L * (k + 1) / 3;
      const x0 = lf.px + s0 * ca, x1 = lf.px + s1 * ca;
      const z0 = lf.pz + s0 * sa, z1 = lf.pz + s1 * sa;
      const sh = lf.segs[k];
      const xa = Math.min(x0, x1) - 0.004, xb = Math.max(x0, x1) + 0.004;
      const pts = [[xa, lf.py - lf.W / 2], [xb, lf.py - lf.W / 2], [xb, lf.py + lf.W / 2], [xa, lf.py + lf.W / 2]];
      for (let i = 0; i < 4; i++) { sh.lv[2 * i] = pts[i][0]; sh.lv[2 * i + 1] = pts[i][1]; }
      sh.z0 = Math.max(0.0005, Math.min(z0, z1) - ARM_HT); sh.z1 = Math.max(z0, z1) + ARM_HT;
    }
  }

  // ------------------------------------------------------------ restrições
  prepare(dt) {
    const b = this.body, c = Math.cos(b.a), s = Math.sin(b.a);
    this.dt = dt;
    if (!this.grounded) return;
    // cargas normais: estática + transferência pela aceleração
    const sup = [];
    for (const w of this.wheels) sup.push(w);
    for (const k of this.casters) sup.push(k);
    const m = b.m, h = this.hcom;
    const bx = -m * this.acc[0] * h, by = -m * this.acc[1] * h;
    solveLoads(sup, m * G, bx, by);
    const tx = c, ty = s, nx = -s, ny = c;
    for (const w of this.wheels) {
      w.wx = c * w.rx - s * w.ry; w.wy = s * w.rx + c * w.ry;
      w.tx = tx; w.ty = ty;
      const rt = w.wx * ty - w.wy * tx, rn = w.wx * ny - w.wy * nx;
      w.Kt = 1 / (b.im + rt * rt * b.iI + w.R * w.R / w.J);
      w.Kn = 1 / (b.im + rn * rn * b.iI);
      w.lt = 0; w.ln = 0;
      w.maxF = w.mu * w.N * dt;
    }
    for (const k of this.casters) {
      k.wx = c * k.rx - s * k.ry; k.wy = s * k.rx + c * k.ry;
      k.lx = 0; k.ly = 0; k.maxF = k.mu * k.N * dt;
      // massa efetiva 2x2 (aprox. diagonal)
      k.Kx = 1 / (b.im + k.wy * k.wy * b.iI); k.Ky = 1 / (b.im + k.wx * k.wx * b.iI);
    }
  }

  solve() {
    if (!this.grounded) return;
    const b = this.body;
    for (const w of this.wheels) {
      const nx = -w.ty, ny = w.tx;
      const vcx = b.vx - b.w * w.wy, vcy = b.vy + b.w * w.wx;
      const st = vcx * w.tx + vcy * w.ty - w.R * w.omega;
      const sn = vcx * nx + vcy * ny;
      let nt = w.lt - st * w.Kt, nn = w.ln - sn * w.Kn;
      const mag = Math.hypot(nt, nn);
      if (mag > w.maxF) { const k = w.maxF / mag; nt *= k; nn *= k; }
      const dT = nt - w.lt, dN = nn - w.ln;
      w.lt = nt; w.ln = nn;
      const Px = w.tx * dT + nx * dN, Py = w.ty * dT + ny * dN;
      b.vx += Px * b.im; b.vy += Py * b.im; b.w += (w.wx * Py - w.wy * Px) * b.iI;
      w.omega -= w.R * dT / w.J;
    }
    for (const k of this.casters) {
      const vcx = b.vx - b.w * k.wy, vcy = b.vy + b.w * k.wx;
      let nx = k.lx - vcx * k.Kx, ny = k.ly - vcy * k.Ky;
      const mag = Math.hypot(nx, ny);
      if (mag > k.maxF) { const q = k.maxF / mag; nx *= q; ny *= q; }
      const dx = nx - k.lx, dy = ny - k.ly; k.lx = nx; k.ly = ny;
      b.vx += dx * b.im; b.vy += dy * b.im; b.w += (k.wx * dy - k.wy * dx) * b.iI;
    }
  }

  postStep(dt) {
    const b = this.body;
    for (const w of this.wheels) w.angle += w.omega * dt;
    // aceleração no referencial do corpo (filtrada)
    const ax = (b.vx - this._pv[0]) / dt, ay = (b.vy - this._pv[1]) / dt;
    this._pv[0] = b.vx; this._pv[1] = b.vy;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const bx = c * ax + s * ay, by = -s * ax + c * ay;
    const k = 0.08;
    this.acc[0] += k * (clamp(bx, -30, 30) - this.acc[0]);
    this.acc[1] += k * (clamp(by, -30, 30) - this.acc[1]);
    // braços frontais: formas, ponta e gancho
    for (const lf of this.lifts) {
      this._updateLiftShapes(lf);
      const reach = lf.px + lf.L * Math.cos(lf.alpha);
      const tipZ = lf.pz + lf.L * Math.sin(lf.alpha);
      const wx = b.x + c * reach - s * lf.py, wy = b.y + s * reach + c * lf.py;
      lf.tipW = [wx, wy, tipZ];
      this._hookLogic(lf, wx, wy, tipZ);
      lf.prevTipZ = tipZ;
    }
    // sensores de força e toques
    this.touching.clear();
    const fs = this.forceN;
    for (const key in this.sensorShapes) fs[key] = 0;
    let bump = 0;
    const log = this.world.impulseLog;
    for (let i = 0; i < log.length; i += 2) {
      const cc = log[i], imp = log[i + 1];
      const mineA = cc.A === b || cc.A.group === ROBOT_GROUP, mineB = cc.B === b || cc.B.group === ROBOT_GROUP;
      if (mineA === mineB) continue;
      const other = mineA ? cc.B : cc.A;
      const myShape = mineA ? cc.sa : cc.sb;
      this.touching.add(other.id);
      other.touch = this.world.t;
      if (myShape.tag && myShape.tag.startsWith('force:')) fs[myShape.tag] += imp / dt;
      if (cc.A === b || cc.B === b) bump += imp;
    }
    this.bumpImpulse = bump;
  }

  _hookLogic(lf, wx, wy, tipZ) {
    if (lf.hooked) {
      const o = lf.hooked, b = this.body;
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const ox = lf.hookOff[0], oy = lf.hookOff[1];
      o.x = wx + c * ox - s * oy; o.y = wy + s * ox + c * oy; o.a = b.a + lf.hookOff[2];
      o.vx = b.vx; o.vy = b.vy; o.w = b.w;
      const hz = o.data.handleZ;
      o.lift = Math.max(0, tipZ - hz);
      if (o.lift <= 0.0008 && lf.omega <= 0) {
        o.lift = 0; o.group = 0; setKind(o, 'dynamic'); o.vx *= 0.5; o.vy *= 0.5;
        lf.hooked = null;
      }
      return;
    }
    if (lf.omega <= 0) return;
    for (const o of this.world.bodies) {
      const d = o.data; if (!d || !d.handleZ || o.kind !== 'dynamic') continue;
      const hz = d.handleZ;
      if (!(lf.prevTipZ < hz && tipZ >= hz)) continue;
      const hr = d.handleR || 0.02;
      if ((o.x - wx) ** 2 + (o.y - wy) ** 2 > hr * hr) continue;
      const b = this.body, c = Math.cos(-b.a), s = Math.sin(-b.a);
      const dx = o.x - wx, dy = o.y - wy;
      lf.hookOff = [c * dx - s * dy, s * dx + c * dy, o.a - b.a];
      lf.hooked = o; setKind(o, 'kinematic'); o.group = ROBOT_GROUP;
      break;
    }
  }

  liftState() { return this.lifts.map(l => ({ port: l.port, alpha: l.alpha, tip: l.tipW, hooked: l.hooked ? l.hooked.id : 0, rest: l.restOn ? l.restOn.id : 0, press: l.pressF })); }
}

// Cargas normais nos apoios: mínima norma com N >= 0 (redistribui se algum sair do chão)
function solveLoads(sup, Wt, Mx, My) {
  // equações: sum N = Wt ; sum N*rx = Mx ; sum N*ry = My  (posições relativas ao CG)
  let act = sup.map(() => true);
  for (let pass = 0; pass < 4; pass++) {
    const idx = sup.map((_, i) => i).filter(i => act[i]);
    if (idx.length === 0) break;
    // A (3 x n), resolve N = A^T (A A^T)^-1 b
    const A = [[], [], []];
    for (const i of idx) { A[0].push(1); A[1].push(sup[i].rx); A[2].push(sup[i].ry); }
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { let s = 0; for (let k = 0; k < idx.length; k++) s += A[r][k] * A[q][k]; M[r][q] = s; }
    for (let r = 0; r < 3; r++) M[r][r] += 1e-9;
    const bvec = [Wt, Mx, My];
    const y = solve3(M, bvec);
    if (!y) { for (const i of idx) sup[i].N = Wt / idx.length; break; }
    let neg = false;
    for (let k = 0; k < idx.length; k++) {
      const N = y[0] * A[0][k] + y[1] * A[1][k] + y[2] * A[2][k];
      sup[idx[k]].N = N;
      if (N < 0) { neg = true; }
    }
    for (let i = 0; i < sup.length; i++) if (!act[i]) sup[i].N = 0;
    if (!neg) break;
    for (let k = 0; k < idx.length; k++) if (sup[idx[k]].N < 0) { act[idx[k]] = false; sup[idx[k]].N = 0; }
  }
  let tot = 0; for (const s of sup) { s.N = Math.max(0, s.N); tot += s.N; }
  if (tot > 0) for (const s of sup) s.N *= Wt / tot;
}

function solve3(M, b) {
  const [a, bb, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-18) return null;
  const inv = [
    [(e * i - f * h) / det, (c * h - bb * i) / det, (bb * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (bb * g - a * h) / det, (a * e - bb * d) / det],
  ];
  return [0, 1, 2].map(r => inv[r][0] * b[0] + inv[r][1] * b[1] + inv[r][2] * b[2]);
}
