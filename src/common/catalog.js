// ============================================================================
//  MyFLL.lab :: catalog.js
//  Catálogo de peças (dimensões em mm, massas em kg) e layout do robô a partir
//  da configuração do montador. Compartilhado pela física, pela vista 3D e pelo
//  montador. Referencial do robô: origem no meio do eixo das rodas motrizes,
//  x para a frente, y para a esquerda, z para cima.
// ============================================================================

export const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const MOTORS = {
  large: {
    id: 49, name: 'Motor grande', short: 'Grande', maxSpeed: 1050, nl: 1175, stall: 0.26, Istall: 1.6,
    J: 3.0e-4, fc: 0.010, fv: 1.2e-4, mass: 0.056, box: [56, 32, 40], disc: 32,
  },
  medium: {
    id: 48, name: 'Motor médio', short: 'Médio', maxSpeed: 1110, nl: 1250, stall: 0.17, Istall: 1.2,
    J: 1.6e-4, fc: 0.007, fv: 0.9e-4, mass: 0.040, box: [48, 24, 32], disc: 24,
  },
  small: {
    id: 65, name: 'Motor pequeno', short: 'Pequeno', maxSpeed: 660, nl: 740, stall: 0.07, Istall: 0.6,
    J: 0.6e-4, fc: 0.003, fv: 0.5e-4, mass: 0.025, box: [40, 24, 24], disc: 16,
  },
};

export const SENSORS = {
  color: { id: 61, name: 'Sensor de cor', short: 'Cor', mass: 0.018, box: [24, 16, 32] },
  distance: { id: 62, name: 'Sensor de distância', short: 'Distância', mass: 0.022, box: [24, 56, 24] },
  force: { id: 63, name: 'Sensor de força', short: 'Força', mass: 0.020, box: [40, 24, 24] },
};

export const WHEELS = {
  spike56: { d: 56, w: 14, name: 'Roda 56 mm', mass: 0.018, mu: 0.95 },
  spike88: { d: 88, w: 14, name: 'Roda 88 mm', mass: 0.040, mu: 0.95 },
  technic62: { d: 62.4, w: 20, name: 'Roda 62,4 mm', mass: 0.030, mu: 0.92 },
  small43: { d: 43.2, w: 22, name: 'Roda 43,2 mm', mass: 0.016, mu: 0.9 },
};

export const CASTERS = {
  ball: { name: 'Esfera (rodízio)', mu: 0.05, mass: 0.014, size: 24 },
  skid: { name: 'Deslizador liso', mu: 0.24, mass: 0.006, size: 16 },
};

export const HUB = { mass: 0.190, box: [88, 56, 32] };  // comprimento, largura, altura

export const DEVICE_IDS = { 48: 'Motor médio', 49: 'Motor grande', 61: 'Sensor de cor', 62: 'Sensor de distância', 63: 'Sensor de força', 65: 'Motor pequeno' };

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ------------------------------------------------------------ robôs prontos
export const ROBOT_PRESETS = {
  competicao: {
    name: 'Base de competição',
    desc: 'Duas rodas motrizes, dois sensores de cor para linha, braço frontal e sensor de distância.',
    chassis: { front: 72, back: 124, width: 112, clearance: 12, height: 40 },
    hub: { x: -56, y: 0, z: 72, rot: 0, mount: 'flat' },
    drive: { wheel: 'spike56', track: 136, x: 0, left: 'A', right: 'B', motor: 'large' },
    casters: [{ type: 'ball', x: -112, y: 0 }],
    devices: [
      { kind: 'color', port: 'C', x: 60, y: 26, z: 12 },
      { kind: 'color', port: 'D', x: 60, y: -26, z: 12 },
      { kind: 'distance', port: 'F', x: 80, y: 0, z: 58, dir: 0 },
    ],
    attachments: [
      { kind: 'lift', port: 'E', motor: 'medium', x: 36, y: 0, z: 100, length: 140, width: 48, gear: 1, dir: 1, min: -40, max: 80, start: 70 },
    ],
    ballast: 0,
  },
  simples: {
    name: 'Robô didático',
    desc: 'Base enxuta para começar: rodas, um sensor de cor, sensor de distância e sensor de força.',
    chassis: { front: 64, back: 112, width: 104, clearance: 12, height: 40 },
    hub: { x: -48, y: 0, z: 70, rot: 0, mount: 'flat' },
    drive: { wheel: 'spike56', track: 128, x: 0, left: 'A', right: 'B', motor: 'large' },
    casters: [{ type: 'ball', x: -100, y: 0 }],
    devices: [
      { kind: 'color', port: 'C', x: 54, y: 0, z: 12 },
      { kind: 'distance', port: 'D', x: 72, y: 0, z: 54, dir: 0 },
      { kind: 'force', port: 'E', x: 76, y: 34, z: 30, dir: 0 },
    ],
    attachments: [],
    ballast: 0,
  },
  varredor: {
    name: 'Varredor lateral',
    desc: 'Braço giratório lateral para alavancas, coletor frontal em U e dois sensores de cor.',
    chassis: { front: 76, back: 120, width: 112, clearance: 12, height: 40 },
    hub: { x: -54, y: 0, z: 72, rot: 0, mount: 'flat' },
    drive: { wheel: 'spike56', track: 136, x: 0, left: 'A', right: 'B', motor: 'large' },
    casters: [{ type: 'ball', x: -108, y: 0 }],
    devices: [
      { kind: 'color', port: 'C', x: 58, y: 30, z: 12 },
      { kind: 'color', port: 'D', x: 58, y: -30, z: 12 },
    ],
    attachments: [
      { kind: 'sweep', port: 'E', motor: 'medium', x: -20, y: 62, z: 46, length: 130, gear: 1, dir: 1, start: 0 },
      { kind: 'collector', x: 76, width: 150, depth: 80, z0: 6, z1: 34 },
    ],
    ballast: 0,
  },
  grande: {
    name: 'Rodas grandes',
    desc: 'Rodas de 88 mm: mais rápido por grau de motor, menos preciso nas curvas.',
    chassis: { front: 76, back: 128, width: 112, clearance: 18, height: 42 },
    hub: { x: -58, y: 0, z: 88, rot: 0, mount: 'flat' },
    drive: { wheel: 'spike88', track: 136, x: 0, left: 'A', right: 'B', motor: 'large' },
    casters: [{ type: 'ball', x: -116, y: 0 }],
    devices: [
      { kind: 'color', port: 'C', x: 64, y: 0, z: 12 },
      { kind: 'distance', port: 'F', x: 84, y: 0, z: 70, dir: 0 },
    ],
    attachments: [
      { kind: 'lift', port: 'E', motor: 'medium', x: 40, y: 0, z: 116, length: 140, width: 48, gear: 1, dir: 1, min: -40, max: 80, start: 70 },
    ],
    ballast: 0,
  },
};

export function defaultRobot() { return deepClone(ROBOT_PRESETS.competicao); }

// ------------------------------------------------------------ validação
export function validateRobot(cfg) {
  const errs = [], warns = [];
  const used = {};
  const use = (p, what) => {
    if (!p) return;
    if (!PORTS.includes(p)) { errs.push(`${what}: porta "${p}" não existe`); return; }
    if (used[p]) errs.push(`Porta ${p} usada por ${used[p]} e ${what}`);
    else used[p] = what;
  };
  use(cfg.drive.left, 'roda esquerda'); use(cfg.drive.right, 'roda direita');
  for (const d of cfg.devices) use(d.port, SENSORS[d.kind]?.name || d.kind);
  for (const a of cfg.attachments) if (a.port) use(a.port, a.kind === 'lift' ? 'braço frontal' : (a.kind === 'sweep' ? 'braço lateral' : 'motor'));
  const wh = WHEELS[cfg.drive.wheel] || WHEELS.spike56;
  const inner = cfg.drive.track - wh.w - 4;
  if (cfg.chassis.width > inner) warns.push('O chassi encosta nas rodas: aumente a bitola ou estreite o chassi.');
  for (const d of cfg.devices) {
    if (d.kind === 'color') {
      if (d.z > 40) warns.push(`Sensor de cor na porta ${d.port} muito alto (${d.z} mm): a leitura fica fraca.`);
      if (d.z < 4) warns.push(`Sensor de cor na porta ${d.port} raspando no tapete.`);
    }
  }
  const L = layoutRobot(cfg);
  if (L.bounds.maxZ > 305) warns.push('Robô com mais de 305 mm de altura (limite comum de área de lançamento).');
  const ax = cfg.drive.x || 0;
  const sup = [[ax, cfg.drive.track / 2], [ax, -cfg.drive.track / 2], ...cfg.casters.map(c => [c.x, c.y || 0])];
  if (!insideHull(sup, L.com[0], L.com[1], 6)) warns.push('Centro de massa fora da base de apoio (rodas e rodízio): o robô tomba. Mova o hub, o rodízio ou acrescente lastro.');
  if (!cfg.casters.length) warns.push('Sem rodízio: o robô precisa de um terceiro apoio.');
  return { errs, warns, used, com: L.com, mass: L.mass };
}

function insideHull(pts, x, y, margin = 0) {
  if (pts.length < 3) return false;
  // envoltória convexa (monotone chain)
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1));
  if (H.length < 3) return false;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    const d = (ex * (y - a[1]) - ey * (x - a[0])) / L;   // > 0 = dentro (anti-horário)
    if (d < margin) return false;
  }
  return true;
}

// ------------------------------------------------------------ layout
// Gera a lista de peças (caixas) com posição, dimensões e massa. É a fonte
// única para colisão, massa e desenho.
export function layoutRobot(cfg) {
  const parts = [];
  const ch = cfg.chassis;
  const wh = WHEELS[cfg.drive.wheel] || WHEELS.spike56;
  const dm = MOTORS[cfg.drive.motor] || MOTORS.large;
  const tr = cfg.drive.track, ax = cfg.drive.x || 0;
  const add = (p) => { parts.push(p); return p; };

  // chassi (placa de vigas)
  const chLen = ch.front + ch.back;
  add({ kind: 'chassis', x: (ch.front - ch.back) / 2, y: 0, z: ch.clearance + ch.height / 2,
    w: chLen, d: ch.width, h: ch.height, mass: chLen * ch.width * 7.5e-6, collide: true });
  // rodas e motores de tração
  for (const side of [1, -1]) {
    const y = side * tr / 2;
    add({ kind: 'wheel', side, x: ax, y, z: wh.d / 2, w: wh.d, d: wh.w, h: wh.d, mass: wh.mass, wheel: cfg.drive.wheel,
      port: side > 0 ? cfg.drive.left : cfg.drive.right, collide: true });
    const my = side * (tr / 2 - wh.w / 2 - 2 - dm.box[1] / 2);
    add({ kind: 'motor', role: 'drive', side, motor: cfg.drive.motor, x: ax - dm.box[0] * 0.22, y: my, z: wh.d / 2,
      w: dm.box[0], d: dm.box[1], h: dm.box[2], mass: dm.mass, port: side > 0 ? cfg.drive.left : cfg.drive.right,
      faceY: side, collide: false });
  }
  // rodízios
  for (const c of cfg.casters) {
    const cs = CASTERS[c.type] || CASTERS.ball;
    add({ kind: 'caster', type: c.type, x: c.x, y: c.y || 0, z: Math.max(8, ch.clearance) / 2, w: cs.size, d: cs.size,
      h: Math.max(8, ch.clearance), mass: cs.mass, collide: false });
  }
  // hub
  const hb = HUB.box;
  const rot = ((cfg.hub.rot || 0) % 360 + 360) % 360;
  const flat = cfg.hub.mount !== 'upright';
  const along = (rot === 90 || rot === 270);
  let hw = flat ? (along ? hb[1] : hb[0]) : (along ? hb[2] : hb[0]);
  let hd = flat ? (along ? hb[0] : hb[1]) : (along ? hb[0] : hb[2]);
  let hh = flat ? hb[2] : hb[1];
  add({ kind: 'hub', x: cfg.hub.x, y: cfg.hub.y || 0, z: cfg.hub.z, w: hw, d: hd, h: hh, mass: HUB.mass, rot, mount: cfg.hub.mount || 'flat', collide: true });
  // sensores
  for (const d of cfg.devices) {
    const s = SENSORS[d.kind]; if (!s) continue;
    if (d.kind === 'color') {
      add({ kind: 'color', port: d.port, x: d.x, y: d.y, z: d.z + s.box[2] / 2, w: s.box[0], d: s.box[1], h: s.box[2], mass: s.mass, face: d.z, collide: true, dev: d });
    } else if (d.kind === 'distance') {
      add({ kind: 'distance', port: d.port, x: d.x, y: d.y, z: d.z, w: s.box[0], d: s.box[1], h: s.box[2], mass: s.mass, rot: d.dir || 0, collide: true, dev: d });
    } else if (d.kind === 'force') {
      add({ kind: 'force', port: d.port, x: d.x, y: d.y, z: d.z, w: s.box[0], d: s.box[1], h: s.box[2], mass: s.mass, rot: d.dir || 0, collide: true, dev: d });
    }
  }
  // acessórios
  for (const a of cfg.attachments) {
    if (a.kind === 'lift') {
      const m = MOTORS[a.motor] || MOTORS.medium;
      add({ kind: 'motor', role: 'lift', motor: a.motor, port: a.port, x: a.x - 18, y: a.y + (a.width / 2 + m.box[1] / 2 + 2), z: a.z,
        w: m.box[0], d: m.box[1], h: m.box[2], mass: m.mass, faceY: -1, collide: false, att: a });
      add({ kind: 'lift', port: a.port, x: a.x, y: a.y, z: a.z, length: a.length, width: a.width, mass: 0.028 + a.length * 1.2e-4, collide: false, att: a });
    } else if (a.kind === 'sweep') {
      const m = MOTORS[a.motor] || MOTORS.medium;
      add({ kind: 'motor', role: 'sweep', motor: a.motor, port: a.port, x: a.x, y: a.y - Math.sign(a.y || 1) * 10, z: a.z + m.box[2] / 2 + 6,
        w: m.box[0], d: m.box[1], h: m.box[2], mass: m.mass, vertical: true, collide: false, att: a });
      add({ kind: 'sweep', port: a.port, x: a.x, y: a.y, z: a.z, length: a.length, mass: 0.02 + a.length * 1e-4, collide: false, att: a });
    } else if (a.kind === 'collector') {
      const t = 8;
      const z = (a.z0 + a.z1) / 2, h = a.z1 - a.z0;
      add({ kind: 'beam', x: a.x + t / 2, y: 0, z, w: t, d: a.width, h, mass: 0.006, collide: true, att: a, coll: true });
      add({ kind: 'beam', x: a.x + a.depth / 2, y: a.width / 2 - t / 2, z, w: a.depth, d: t, h, mass: 0.006, collide: true, att: a, coll: true });
      add({ kind: 'beam', x: a.x + a.depth / 2, y: -a.width / 2 + t / 2, z, w: a.depth, d: t, h, mass: 0.006, collide: true, att: a, coll: true });
    } else if (a.kind === 'plow') {
      const t = 8, z = (a.z0 + a.z1) / 2, h = a.z1 - a.z0;
      add({ kind: 'beam', x: a.x + t / 2, y: 0, z, w: t, d: a.width, h, mass: 0.008, collide: true, att: a });
    } else if (a.kind === 'motor') {
      const m = MOTORS[a.motor] || MOTORS.medium;
      add({ kind: 'motor', role: 'free', motor: a.motor, port: a.port, x: a.x, y: a.y, z: a.z,
        w: m.box[0], d: m.box[1], h: m.box[2], mass: m.mass, faceY: 1, collide: true, att: a });
    }
  }
  if (cfg.ballast) add({ kind: 'ballast', x: cfg.ballastX || 0, y: 0, z: ch.clearance + ch.height + 6, w: 32, d: 32, h: 12, mass: cfg.ballast / 1000, collide: false });

  // centro de massa e limites
  let M = 0, cx = 0, cy = 0, cz = 0;
  const B = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, maxZ: 0 };
  for (const p of parts) {
    M += p.mass; cx += p.mass * p.x; cy += p.mass * p.y; cz += p.mass * p.z;
    const w = p.w || p.length || 0, d = p.d || p.width || 0;
    B.minX = Math.min(B.minX, p.x - w / 2); B.maxX = Math.max(B.maxX, p.x + w / 2 + (p.kind === 'lift' ? p.length / 2 : 0));
    B.minY = Math.min(B.minY, p.y - d / 2); B.maxY = Math.max(B.maxY, p.y + d / 2);
    B.maxZ = Math.max(B.maxZ, p.z + (p.h || 0) / 2);
  }
  cx /= M; cy /= M; cz /= M;
  let I = 0;
  for (const p of parts) {
    const w = (p.w || p.length || 20) / 1000, d = (p.d || p.width || 20) / 1000;
    I += p.mass * (((p.x - cx) / 1000) ** 2 + ((p.y - cy) / 1000) ** 2) + p.mass * (w * w + d * d) / 12;
  }
  return { parts, mass: M, com: [cx, cy, cz], I, bounds: B, wheel: wh, driveMotor: dm };
}
