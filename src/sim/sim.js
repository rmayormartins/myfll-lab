// ============================================================================
//  MyFLL.lab :: sim.js
//  Monta o mundo: mesa com bordas, tapete (imagem), modelos de missão, robô e
//  hub. Calcula os sensores (cor, distância, força) e produz os quadros.
// ============================================================================
import { World, makeBody, polyShape, circleShape, boxPts, setMassFromShapes, worldPivot, worldSlider, rayShape, rayHit, pointInShape, updateBodyShapes } from './physics.js';
import { Robot, ROBOT_GROUP } from './robot.js';
import { Hub, SPIKE_COLORS } from './hub.js';
import { PORTS, MOTORS, SENSORS, layoutRobot } from '../common/catalog.js';
import { OBJ_TYPES, TABLE, MAT } from '../common/objects.js';
import { makeRng, clamp, DEG } from '../common/rng.js';

const MM = 0.001;
export const DT = 0.001;

function srgb2lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = srgb2lin(i);

export class Sim {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1234;
    this.realism = opts.realism ?? 1;
    this.rng = makeRng(this.seed);
    this.world = new World();
    this.world.iterations = 10;
    this.hub = new Hub(this, makeRng(this.seed ^ 0x55aa), { realism: this.realism, soc: opts.soc });
    this.mat = null;            // { data: Uint8Array RGB, W, H, s (px/mm) }
    this.robot = null; this.robotCfg = null;
    this.objects = [];          // { def, bodies, joint, state, kind }
    this.walls = [];
    this.manualForce = [0, 0, 0, 0, 0, 0];
    this.forceF = [0, 0, 0, 0, 0, 0];
    this.sensorNoise = makeRng(this.seed ^ 0x1234);
    this.buildTable();
  }

  // ------------------------------------------------------------ mesa
  buildTable() {
    const T = TABLE, t = T.wallT, h = T.wallH * MM;
    const mk = (x0, y0, x1, y1) => {
      const b = makeBody({ kind: 'static', x: (x0 + x1) / 2 * MM, y: (y0 + y1) / 2 * MM, tag: 'wall', autoMass: false });
      b.shapes = [polyShape(boxPts((x1 - x0) * MM, (y1 - y0) * MM), { z0: 0, z1: h, mu: 0.5, e: 0.1, tag: 'wall' })];
      this.world.add(b); this.walls.push(b);
    };
    mk(T.x0 - t, T.y0 - t, T.x1 + t, T.y0);
    mk(T.x0 - t, T.y1, T.x1 + t, T.y1 + t);
    mk(T.x0 - t, T.y0, T.x0, T.y1);
    mk(T.x1, T.y0, T.x1 + t, T.y1);
  }

  setMat(data, W, H, s) { this.mat = { data, W, H, s }; }

  // ------------------------------------------------------------ robô
  setRobot(cfg, pose) {
    const old = this.robot ? this.robot.pose() : null;
    if (this.robot) { this.robot.destroy(); this.robot = null; }
    this.hub.detachAll();
    this.robotCfg = cfg;
    const p = pose || (old ? old : { x: 0.25, y: 0.3, a: 0 });
    this.robot = new Robot(this.world, cfg, { rng: makeRng(this.seed ^ 0x9e37), realism: this.realism, pose: p });
    this.robot.hub = this.hub;
    const idx = (L) => PORTS.indexOf(L);
    // motores de tração
    for (const w of this.robot.wheels) if (w.port) this.hub.attachMotor(idx(w.port), cfg.drive.motor, w);
    for (const lf of this.robot.lifts) if (lf.port) this.hub.attachMotor(idx(lf.port), lf.att.motor || 'medium', lf);
    for (const sw of this.robot.sweeps) if (sw.port) this.hub.attachMotor(idx(sw.port), sw.att.motor || 'medium', sw);
    for (const f of this.robot.frees) if (f.port) this.hub.attachMotor(idx(f.port), f.att ? f.att.motor : 'medium', f);
    for (const d of cfg.devices) if (d.port && SENSORS[d.kind]) this.hub.attachSensor(idx(d.port), d.kind, d);
    for (const a of cfg.attachments) if (a.kind === 'motor' && a.port && !this.hub.ports[idx(a.port)]) {
      const dof = this.robot.dofs[a.port];
      this.hub.attachMotor(idx(a.port), a.motor || 'medium', dof || null);
    }
  }

  setRobotPose(x, y, a) { if (this.robot) this.robot.setPose(x * MM, y * MM, a * DEG); }

  // ------------------------------------------------------------ objetos
  clearObjects() {
    for (const o of this.objects) { for (const b of o.bodies) this.world.remove(b); }
    this.world.joints = this.world.joints.filter(j => !j.obj);
    this.objects = [];
  }
  setObjects(defs) {
    this.clearObjects();
    for (const d of defs) this.addObject(d);
  }
  addObject(d) {
    const t = OBJ_TYPES[d.type]; if (!t) return null;
    const x = d.x * MM, y = d.y * MM, a = (d.a || 0) * DEG;
    const o = { def: d, id: d.id, type: d.type, bodies: [], joint: null, state: 0, done: false, pressT: 0, armed: {}, kind: 'free' };
    const h = (d.h ?? t.h ?? 50) * MM;
    const mass = (d.mass ?? t.mass ?? 50) / 1000;
    const mu = t.mu ?? 0.4;
    switch (d.type) {
      case 'caixa': case 'torre': case 'cesta': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const b = makeBody({ kind: 'dynamic', x, y, a, m: mass, groundMu: mu, groundR: 0.3 * Math.hypot(w, dd), tag: 'obj', autoMass: false });
        b.shapes = [polyShape(boxPts(w, dd), { z0: 0, z1: h, mu: 0.45, e: 0.1, tag: 'obj' })];
        setMassFromShapes(b, mass);
        if (d.type === 'cesta') b.data = { handleZ: (d.handle ?? t.handle) * MM, handleR: Math.min(w, dd) * 0.35 };
        o.bodies.push(b); break;
      }
      case 'cilindro': case 'bola': {
        const r = (d.r ?? t.r) * MM;
        const b = makeBody({ kind: 'dynamic', x, y, a, m: mass, groundMu: mu, groundR: 0.5 * r, tag: 'obj', autoMass: false });
        b.shapes = [circleShape(0, 0, r, { z0: 0, z1: h, mu: d.type === 'bola' ? 0.3 : 0.45, e: d.type === 'bola' ? 0.5 : 0.1, tag: 'obj' })];
        setMassFromShapes(b, mass);
        if (d.type === 'bola') { b.I *= 0.4 / 0.5; b.iI = 1 / b.I; }
        o.bodies.push(b); break;
      }
      case 'parede': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const b = makeBody({ kind: 'static', x, y, a, tag: 'fixed', autoMass: false });
        b.shapes = [polyShape(boxPts(w, dd), { z0: 0, z1: h, mu: 0.5, e: 0.1, tag: 'fixed' })];
        o.bodies.push(b); o.kind = 'fixed'; break;
      }
      case 'alavanca': {
        const L = (d.len ?? t.len) * MM, dir = d.dir ?? t.dir ?? 1, sw = (d.swing ?? t.swing) * DEG;
        const base = makeBody({ kind: 'static', x, y, a, tag: 'fixed', autoMass: false });
        base.shapes = [circleShape(0, 0, 0.018, { z0: 0, z1: h + 0.01, mu: 0.5, tag: 'fixed' })];
        const bx = x + Math.cos(a) * L / 2, by = y + Math.sin(a) * L / 2;
        const bar = makeBody({ kind: 'dynamic', x: bx, y: by, a, m: mass, ground: false, tag: 'obj', autoMass: false });
        bar.shapes = [polyShape(boxPts(L, 0.016), { z0: 0.012, z1: h, mu: 0.4, e: 0.05, tag: 'obj' })];
        setMassFromShapes(bar, mass);
        const j = worldPivot(bar, x, y, { lower: dir > 0 ? 0 : -sw, upper: dir > 0 ? sw : 0, fricT: 0.025, damp: 0.002 });
        j.obj = true; this.world.addJoint(j);
        o.bodies.push(base, bar); o.joint = j; o.kind = 'lever'; o.dir = dir; o.swing = sw; break;
      }
      case 'empurrador': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM, tr = (d.travel ?? t.travel) * MM;
        const b = makeBody({ kind: 'dynamic', x, y, a, m: mass, ground: false, tag: 'obj', autoMass: false });
        b.shapes = [polyShape(boxPts(w, dd), { z0: 0, z1: h, mu: 0.4, e: 0.05, tag: 'obj' })];
        setMassFromShapes(b, mass);
        const k = (d.spring ?? t.spring) || 0;
        const j = worldSlider(b, Math.cos(a), Math.sin(a), { lower: 0, upper: tr, fric: 0.8, k, damp: 0.5 });
        j.obj = true; this.world.addJoint(j);
        o.bodies.push(b); o.joint = j; o.kind = 'slider'; o.travel = tr; break;
      }
      case 'botao': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const b = makeBody({ kind: 'static', x, y, a, tag: 'fixed', autoMass: false });
        b.shapes = [polyShape(boxPts(w, dd), { z0: 0, z1: h, mu: 0.5, tag: 'fixed' })];
        o.bodies.push(b); o.kind = 'button'; o.force = d.force ?? t.force; break;
      }
      case 'bandeira': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const b = makeBody({ kind: 'static', x, y, a, tag: 'fixed', autoMass: false });
        b.shapes = [polyShape(boxPts(w, dd), { z0: 0, z1: h, mu: 0.5, tag: 'fixed' })];
        o.bodies.push(b); o.kind = 'flag';
        // gatilho: alavanquinha saindo para a frente da base
        o.trig = { x: x + Math.cos(a) * (w / 2 + 0.03), y: y + Math.sin(a) * (w / 2 + 0.03), r: 0.03, zLow: 0.03, zHigh: 0.055 };
        break;
      }
      case 'marcador': o.kind = 'marker'; break;
    }
    if (o.bodies.length > 1) { const g = 100 + (this._grp = (this._grp || 0) + 1); for (const b of o.bodies) b.group = g; }
    for (const b of o.bodies) { b.objRef = o; this.world.add(b); }
    this.objects.push(o);
    return o;
  }
  objById(id) { return this.objects.find(o => o.id === id); }
  moveObject(id, xmm, ymm, adeg) {
    const o = this.objById(id); if (!o) return;
    const d = Object.assign({}, o.def, { x: xmm, y: ymm, a: adeg });
    const i = this.objects.indexOf(o);
    for (const b of o.bodies) this.world.remove(b);
    if (o.joint) this.world.joints = this.world.joints.filter(j => j !== o.joint);
    this.objects.splice(i, 1);
    const n = this.addObject(d);
    this.objects.splice(this.objects.indexOf(n), 1); this.objects.splice(i, 0, n);
  }

  // ------------------------------------------------------------ passo
  step() {
    const dt = DT;
    this.hub.step(dt);
    this.world.step(dt);
    this.mechStep(dt);
  }

  mechStep(dt) {
    const lifts = this.robot ? this.robot.lifts : [];
    for (const o of this.objects) {
      if (o.kind === 'lever') {
        const ang = Math.abs(o.joint.angle());
        o.state = clamp(ang / o.swing, 0, 1);
        if (o.state > 0.66) o.done = true;
      } else if (o.kind === 'slider') {
        o.state = clamp(o.joint.pos() / o.travel, 0, 1);
        if (o.state > 0.85) o.done = true;
      } else if (o.kind === 'button') {
        let f = 0;
        for (const lf of lifts) if (lf.restOn && lf.restOn === o.bodies[0]) f = Math.max(f, lf.pressF);
        o.force_now = f;
        if (f >= o.force) o.pressT += dt; else o.pressT = Math.max(0, o.pressT - dt);
        o.state = clamp(f / o.force, 0, 1);
        if (o.pressT > 0.08) o.done = true;
      } else if (o.kind === 'flag') {
        const tg = o.trig;
        for (const lf of lifts) {
          const [tx, ty, tz] = lf.tipW;
          const inside = (tx - tg.x) ** 2 + (ty - tg.y) ** 2 < (tg.r + lf.W * 0.3) ** 2;
          const key = lf.port;
          if (inside && tz < tg.zLow) o.armed[key] = true;
          if (!inside) o.armed[key] = false;
          if (inside && o.armed[key] && tz > tg.zHigh) o.done = true;
        }
        o.state = o.done ? 1 : Math.max(0, ...lifts.map(lf => o.armed[lf.port] ? 0.2 : 0), 0);
      }
    }
  }

  // ------------------------------------------------------------ sensores
  matColor(xmm, ymm) {
    const M = this.mat;
    if (!M || xmm < 0 || ymm < 0 || xmm >= MAT.W || ymm >= MAT.H) return [70, 52, 38];   // madeira da mesa
    const px = Math.floor(xmm * M.s), py = Math.floor((MAT.H - ymm) * M.s);
    const i = (Math.min(M.H - 1, Math.max(0, py)) * M.W + Math.min(M.W - 1, Math.max(0, px))) * 3;
    return [M.data[i], M.data[i + 1], M.data[i + 2]];
  }
  surfaceUnder(wx, wy, faceZmm) {
    // objeto mais alto abaixo do sensor (topo abaixo da face)
    let top = 0, col = null;
    for (const o of this.objects) {
      for (const b of o.bodies) {
        if (b.group === ROBOT_GROUP && !b.objRef) continue;
        for (const sh of b.shapes) {
          const z = (sh.z1 + b.lift) / MM;
          if (z > faceZmm + 0.5 || z <= top) continue;
          if (!pointInShape(sh, wx, wy)) continue;
          top = z; col = hexRgb(o.def.color || OBJ_TYPES[o.type].color);
        }
      }
    }
    return { top, col };
  }
  colorRaw(dev) {
    const T = this.hub.T;
    if (dev.cache && T - dev.cacheT < 0.005) return dev.cache;
    const r = this.robot, d = dev.info;
    const [wx, wy] = r.toWorld(d.x, d.y);
    const s = this.surfaceUnder(wx, wy, d.z);
    const dist = Math.max(0.5, d.z - s.top);
    const spot = 2 + 0.22 * dist;
    let lr = 0, lg = 0, lb = 0;
    const pts = [[0, 0], [spot, 0], [-spot, 0], [0, spot], [0, -spot]];
    for (const [ox, oy] of pts) {
      const c = s.col && s.top > 0 ? s.col : this.matColor(wx / MM + ox, wy / MM + oy);
      lr += LIN[c[0]]; lg += LIN[c[1]]; lb += LIN[c[2]];
    }
    lr /= pts.length; lg /= pts.length; lb /= pts.length;
    const gain = dist <= 16 ? 1 : Math.pow(16 / dist, 1.6);
    const n = () => this.sensorNoise.normal() * 0.006 * this.realism;
    const R = clamp((0.05 + 0.95 * Math.pow(lr, 0.75)) * gain + n(), 0, 1);
    const Gc = clamp((0.05 + 0.95 * Math.pow(lg, 0.75)) * gain + n(), 0, 1);
    const B = clamp((0.05 + 0.95 * Math.pow(lb, 0.75)) * gain + n(), 0, 1);
    const L = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    const refl = clamp(Math.round(100 * (0.07 + 0.93 * Math.pow(L, 0.7)) * gain + this.sensorNoise.normal() * 0.7 * this.realism), 0, 100);
    const I = clamp((R + Gc + B) / 3, 0, 1);
    const res = { refl, rgbi: [Math.round(R * 1024), Math.round(Gc * 1024), Math.round(B * 1024), Math.round(I * 1024)], gain, dist,
      hsv: rgb2hsv(R, Gc, B), lin: [lr, lg, lb] };
    res.color = classifyColor(res);
    dev.cache = res; dev.cacheT = T;
    return res;
  }
  distanceRaw(dev) {
    const T = this.hub.T;
    if (dev.dcache !== undefined && T - dev.dcacheT < 0.03) return dev.dcache;
    const r = this.robot, d = dev.info;
    const dir = (d.dir || 0) * DEG;
    const fx = d.x + Math.cos(dir) * 12, fy = d.y + Math.sin(dir) * 12;
    const [ox, oy] = r.toWorld(fx, fy);
    const zs = d.z * MM;
    const base = r.body.a + dir;
    let best = Infinity;
    const tanC = Math.tan(9 * DEG);
    for (const off of [-11, -5.5, 0, 5.5, 11]) {
      const a = base + off * DEG, dx = Math.cos(a), dy = Math.sin(a);
      for (const b of this.world.bodies) {
        if (b.group === ROBOT_GROUP && b.kind !== 'kinematic') continue;
        for (const sh of b.shapes) {
          const t = rayShape(sh, ox, oy, dx, dy, 2.2);
          if (t >= best) continue;
          const zlo = zs - t * tanC - 0.004, zhi = zs + t * tanC + 0.004;
          if (sh.z1 + b.lift < zlo || sh.z0 + b.lift > zhi) continue;
          // superfície lisa muito inclinada reflete o som para longe (sem eco)
          if (!rayHit.curved && Math.abs(dx * rayHit.nx + dy * rayHit.ny) < 0.5) continue;
          // ecos fracos nas bordas do cone
          const tt = t * (1 + Math.abs(off) * 0.004);
          if (tt < best) best = tt;
        }
      }
    }
    let mm = -1;
    if (best < 2.0) {
      mm = best / MM;
      mm += this.sensorNoise.normal() * (1 + mm * 0.006) * this.realism;
      mm = Math.round(mm);
      if (mm < 40) mm = mm < 20 ? -1 : 40 + Math.round(this.sensorNoise() * 3);
      if (mm > 2000) mm = -1;
    }
    dev.dcache = mm; dev.dcacheT = T;
    return mm;
  }
  forceRaw(portIdx) {
    const key = 'force:' + PORTS[portIdx];
    const r = this.robot;
    const F = (r && r.forceN[key]) || 0;
    const tot = Math.min(12, F + this.manualForce[portIdx]);
    this.forceF[portIdx] += 0.25 * (tot - this.forceF[portIdx]);
    return clamp(this.forceF[portIdx], 0, 10);
  }

  // ------------------------------------------------------------ quadro
  snapshot() {
    const r = this.robot, hub = this.hub;
    const out = { t: hub.T };
    if (r) {
      const p = r.pose();
      out.robot = { x: p.x / MM, y: p.y / MM, a: p.a, vx: r.body.vx, vy: r.body.vy, w: r.body.w,
        wheels: r.wheels.map(w => w.angle), lifts: r.lifts.map(l => l.alpha), sweeps: r.sweeps.map(s => s.joint.angle() + s.joint.ref),
        frees: r.frees.map(f => f.angle), hooked: r.lifts.map(l => l.hooked ? l.hooked.objRef.id : null),
        tips: r.lifts.map(l => [l.tipW[0] / MM, l.tipW[1] / MM, l.tipW[2] / MM]), grounded: r.grounded,
        touching: [...r.touching].map(id => { const b = this.world.bodies.find(q => q.id === id); return b && b.objRef ? b.objRef.id : null; }).filter(Boolean),
      };
    }
    out.objs = this.objects.map(o => {
      const b = o.bodies.length > 1 ? o.bodies[1] : o.bodies[0];
      const rec = { id: o.id, state: o.state, done: o.done };
      if (b) { rec.x = b.x / MM; rec.y = b.y / MM; rec.a = b.a; rec.z = b.lift / MM; rec.touch = b.touch; }
      if (o.kind === 'lever') rec.ang = o.joint.angle();
      if (o.kind === 'slider') rec.pos = o.joint.pos() / MM;
      return rec;
    });
    out.hub = {
      matrix: hub.physicalMatrix(), power: hub.lights.power, connect: hub.lights.connect,
      batt: Math.round(hub.battery.soc * 100), V: hub.battery.V, I: hub.battery.I,
      yaw: hub.yawDeci(), buttons: Object.assign({}, hub.buttons),
    };
    out.ports = PORTS.map((L, i) => this.portInfo(i));
    return out;
  }
  portInfo(i) {
    const d = this.hub.ports[i];
    if (!d) return null;
    if (d.kind === 'motor') return { k: 'motor', type: d.type, rel: d.relInt(), abs: d.absDeg(), spd: d.velInt(), pwr: d.dutyInt(), st: d.stalled ? 1 : 0 };
    if (d.kind === 'color') { const c = this.colorRaw(d); return { k: 'color', color: c.color, refl: c.refl, rgbi: c.rgbi }; }
    if (d.kind === 'distance') return { k: 'distance', mm: this.distanceRaw(d), lights: d.lights };
    if (d.kind === 'force') { const f = this.forceRaw(i); return { k: 'force', n: Math.round(f * 10) / 10, pressed: f >= 0.5 }; }
    return null;
  }
}

export function hexRgb(h) {
  h = String(h || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

// classificação de cor como no SPIKE (constantes do módulo color)
export function classifyColor(res) {
  if (res.gain < 0.12) return -1;
  const [h, s, v] = res.hsv;
  const refl = res.refl;
  if (refl < 16 && s < 0.55) return 0;           // preto
  if (s < 0.22) return refl > 55 ? 10 : (refl < 26 ? 0 : 10);
  if (v < 0.18) return 0;
  if (h < 16 || h >= 340) return 9;              // vermelho
  if (h < 38) return 8;                          // laranja
  if (h < 72) return 7;                          // amarelo
  if (h < 160) return 6;                         // verde
  if (h < 185) return 5;                         // turquesa
  if (h < 212) return 4;                         // azul-celeste
  if (h < 252) return 3;                         // azul
  if (h < 290) return 2;                         // roxo
  return 1;                                      // magenta
}

export { SPIKE_COLORS, layoutRobot, MOTORS };
