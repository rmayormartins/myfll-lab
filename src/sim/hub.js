// ============================================================================
//  MyFLL.lab :: hub.js
//  "Firmware" do hub: portas A a F, controle dos motores (perfil trapezoidal +
//  PID a 200 Hz, detecção de travamento, modos de parada), pares de motores
//  sincronizados, matriz de luz 5x5, luzes, botões, alto-falante, sensor de
//  movimento (giroscópio integrado com viés e ruído), bateria.
// ============================================================================
import { MOTORS, SENSORS, PORTS } from '../common/catalog.js';
import { clamp, DEG, wrap180 } from '../common/rng.js';
import { FONT5, IMAGES } from '../common/glyphs.js';
import { VNOM } from './robot.js';

export const ST = { READY: 0, RUNNING: 1, STALLED: 2, CANCELLED: 3, ERROR: 4, DISCONNECTED: 5 };
export const STOP = { COAST: 0, BRAKE: 1, HOLD: 2, CONTINUE: 3, SMART_COAST: 4, SMART_BRAKE: 5 };
export const CTRL_DT = 0.005;   // laço de controle dos motores: 200 Hz

// ------------------------------------------------------------ perfis
export class Trap {
  constructor(p0, p1, v0, vmax, acc, dec) {
    this.p0 = p0; this.p1 = p1;
    const D = Math.abs(p1 - p0); this.D = D;
    const s = this.s = p1 >= p0 ? 1 : -1;
    vmax = Math.max(1, Math.abs(vmax)); acc = Math.max(1, Math.abs(acc)); dec = Math.max(1, Math.abs(dec));
    let u0 = clamp(v0 * s, 0, vmax);
    if (D < 1e-9) { this.ta = this.tc = this.td = 0; this.u0 = 0; this.vc = 0; this.acc = acc; this.dec = dec; this.da = 0; this.dc = 0; this.T = 0; return; }
    if (u0 * u0 / (2 * dec) >= D) {
      const d2 = u0 * u0 / (2 * D);
      this.u0 = u0; this.vc = u0; this.acc = acc; this.dec = d2; this.ta = 0; this.tc = 0; this.td = u0 / d2; this.da = 0; this.dc = 0;
    } else {
      let vc = vmax;
      let da = (vc * vc - u0 * u0) / (2 * acc), dd = vc * vc / (2 * dec);
      if (da + dd > D) {
        vc = Math.sqrt((2 * acc * dec * D + dec * u0 * u0) / (acc + dec));
        da = (vc * vc - u0 * u0) / (2 * acc); dd = vc * vc / (2 * dec);
      }
      this.u0 = u0; this.vc = vc; this.acc = acc; this.dec = dec;
      this.ta = (vc - u0) / acc; this.td = vc / dec; this.da = da; this.dc = Math.max(0, D - da - dd);
      this.tc = vc > 0 ? this.dc / vc : 0;
    }
    this.T = this.ta + this.tc + this.td;
  }
  at(t) {
    const s = this.s;
    if (t <= 0) return [this.p0, this.u0 * s];
    if (t < this.ta) return [this.p0 + s * (this.u0 * t + this.acc * t * t / 2), s * (this.u0 + this.acc * t)];
    if (t < this.ta + this.tc) return [this.p0 + s * (this.da + this.vc * (t - this.ta)), s * this.vc];
    if (t < this.T) {
      const q = t - this.ta - this.tc;
      return [this.p0 + s * (this.da + this.dc + this.vc * q - this.dec * q * q / 2), s * (this.vc - this.dec * q)];
    }
    return [this.p1, 0];
  }
}

// perfil por tempo: sobe com acc até v, desce com dec terminando em T
function timeProfileV(t, T, v0, v, acc, dec) {
  const s = v >= 0 ? 1 : -1, V = Math.abs(v);
  if (t >= T) return 0;
  const up = Math.min(V, Math.max(0, v0 * s) + acc * t);
  const down = dec * (T - t);
  return s * Math.max(0, Math.min(up, down));
}

// ------------------------------------------------------------ motor
export class Motor {
  constructor(hub, port, type, dof, rng) {
    this.hub = hub; this.port = port; this.type = type; this.spec = MOTORS[type];
    this.kind = 'motor'; this.id = this.spec.id;
    this.dof = dof;
    this.out = { mode: 'coast', duty: 0 };
    this.mode = 'coast';
    this.refP = 0; this.refV = 0; this.integ = 0; this.stallT = 0; this.stalled = false;
    this.cmd = null; this.traj = null; this.tt = 0; this.stopMode = STOP.BRAKE;
    this.target = 0; this.runV = 0; this.acc = 1000; this.dec = 1000; this.duration = 0; this.v0 = 0;
    this.endOnStall = true; this.ext = null; this.settleT = 0;
    this.absZero = rng ? Math.floor(rng() * 360) - 180 : 0;
    this.relOffset = 0;
    this.vf = 0;          // velocidade filtrada (graus/s)
    this.lastDuty = 0;
    this.load = 0;
    // posição relativa inicial = posição absoluta (como no hub ao ligar)
    this.relOffset = this.rawDeg() - this.absDeg();
    this.gains();
  }
  gains() {
    const t = this.type;
    this.Kp = t === 'large' ? 0.045 : (t === 'medium' ? 0.05 : 0.06);
    this.Kd = t === 'large' ? 0.0011 : 0.0009;
    this.Ki = 0.12;
    this.dFric = this.spec.fc / this.spec.stall;
  }
  rawDeg() { return this.dof ? this.dof.pos() / DEG : 0; }
  velRaw() { return this.dof ? this.dof.vel() / DEG : 0; }
  pos() { return this.rawDeg() - this.relOffset; }          // graus (contínuo)
  relInt() { return Math.round(this.pos()); }
  absDeg() { return wrap180(Math.round(this.rawDeg() + this.absZero)); }
  velInt() { return Math.round(this.vf); }
  maxSpeed() { return this.spec.maxSpeed; }

  cancel(status = ST.CANCELLED) {
    if (this.cmd) { this.hub.finishCmd(this.cmd, status); this.cmd = null; }
    if (this.ext && this.ext.release) { const e = this.ext; this.ext = null; e.release(this); }
    this.ext = null;
  }

  // -------- comandos
  cmdCoast() { this.cancel(); this.setMode('coast'); }
  cmdBrake() { this.cancel(); this.setMode('brake'); }
  cmdHold(target) { this.cancel(); this.setMode('hold'); this.refP = target ?? this.pos(); this.refV = 0; }
  cmdStop(stop) { this.cancel(); this.applyStop(stop, this.pos()); }
  cmdDuty(d) { this.cancel(); this.setMode('duty'); this.out.mode = 'duty'; this.out.duty = clamp(d, -1, 1); }
  cmdRun(v, acc) {
    if (this.mode === 'run' && !this.ext && !this.cmd) {
      // mesmo comando repetido: mantém o controlador (sem reiniciar a referência)
      this.runV = clamp(v, -this.maxSpeed(), this.maxSpeed());
      this.acc = Math.max(1, acc || 1000);
      return;
    }
    const keep = this.mode === 'run' ? this.refV : this.vf;
    this.cancel();
    this.setMode('run');
    this.runV = clamp(v, -this.maxSpeed(), this.maxSpeed());
    this.acc = Math.max(1, acc || 1000);
    this.refV = keep; this.refP = this.pos();
  }
  cmdTraj(target, v, stop, acc, dec, endOnStall = true) {
    this.cancel();
    const cmd = this.hub.newCmd('motor');
    this.cmd = cmd;
    this.setMode('traj');
    const p = this.pos();
    const vv = Math.min(Math.abs(v), this.maxSpeed());
    this.traj = new Trap(p, target, this.vf, vv, acc || 1000, dec || 1000);
    this.target = target; this.stopMode = stop; this.tt = 0; this.settleT = 0; this.endOnStall = endOnStall;
    this.runV = vv * this.traj.s;
    this.refP = p; this.refV = this.vf;
    if (vv < 0.5) { this.finish(ST.READY); }
    return cmd;
  }
  cmdTime(ms, v, stop, acc, dec) {
    this.cancel();
    const cmd = this.hub.newCmd('motor');
    this.cmd = cmd;
    this.setMode('time');
    this.duration = Math.max(0, ms) / 1000; this.runV = clamp(v, -this.maxSpeed(), this.maxSpeed());
    this.acc = Math.max(1, acc || 1000); this.dec = Math.max(1, dec || 1000);
    this.stopMode = stop; this.tt = 0; this.v0 = this.vf; this.refP = this.pos(); this.refV = this.vf;
    if (this.duration <= 0) this.finish(ST.READY);
    return cmd;
  }
  setMode(m) {
    this.mode = m; this.integ = 0; this.stallT = 0; this.stalled = false; this.dutyLimit = null;
    if (m === 'coast') { this.out.mode = 'coast'; this.out.duty = 0; }
    else if (m === 'brake') { this.out.mode = 'brake'; this.out.duty = 0; }
  }
  applyStop(stop, target) {
    if (stop === STOP.HOLD) { this.setMode('hold'); this.refP = target; this.refV = 0; }
    else if (stop === STOP.COAST || stop === STOP.SMART_COAST) this.setMode('coast');
    else if (stop === STOP.CONTINUE) { this.setMode('run'); this.refP = this.pos(); this.refV = this.vf; }
    else this.setMode('brake');
  }
  finish(status) {
    const cmd = this.cmd; this.cmd = null;
    const tgt = this.mode === 'traj' ? this.target : this.pos();
    this.applyStop(this.stopMode, tgt);
    if (cmd) this.hub.finishCmd(cmd, status);
  }

  // -------- laço de controle (200 Hz)
  pid(refP, refV, dt) {
    const p = this.pos(), v = this.vf;
    const e = refP - p;
    const V = this.hub.battery.V;
    const kff = 1 / (this.spec.nl * V / VNOM);
    this.integ += e * dt;
    const iMax = 0.35 / this.Ki;
    this.integ = clamp(this.integ, -iMax, iMax);
    let d = refV * kff + (Math.abs(refV) > 1 ? Math.sign(refV) * this.dFric : 0) + this.Kp * e + this.Ki * this.integ + this.Kd * (refV - v);
    const lim = this.dutyLimit ? clamp(this.dutyLimit, 0.05, 1) : 1;
    const sat = Math.abs(d) > lim;
    // travamento: saturado e quase parado
    if ((sat || Math.abs(e) > 25) && Math.abs(v) < 15 + 0.2 * Math.abs(refV)) this.stallT += dt;
    else this.stallT = Math.max(0, this.stallT - 2 * dt);
    this.stalled = this.stallT > 0.3;
    d = clamp(d, -lim, lim);
    this.out.mode = 'duty'; this.out.duty = d;
    return e;
  }
  control(dt) {
    // velocidade medida: derivada filtrada do encoder
    const vr = this.velRaw();
    this.vf += 0.35 * (vr - this.vf);
    switch (this.mode) {
      case 'coast': this.out.mode = 'coast'; this.out.duty = 0; this.stalled = false; break;
      case 'brake': this.out.mode = 'brake'; this.out.duty = 0; this.stalled = false; break;
      case 'duty': break;
      case 'hold': this.pid(this.refP, 0, dt); break;
      case 'run': {
        const dv = this.acc * dt;
        this.refV += clamp(this.runV - this.refV, -dv, dv);
        this.refP += this.refV * dt;
        const p = this.pos();
        this.refP = clamp(this.refP, p - 40, p + 40);
        this.pid(this.refP, this.refV, dt);
        break;
      }
      case 'traj': {
        this.tt += dt;
        const [rp, rv] = this.traj.at(this.tt);
        const e = this.pid(rp, rv, dt);
        if (this.tt >= this.traj.T) {
          this.settleT += dt;
          if (Math.abs(e) <= 4 || this.settleT > 1.0) { this.finish(ST.READY); break; }
        }
        if (this.stalled && this.endOnStall && this.stallT > 0.4) { this.finish(ST.STALLED); }
        break;
      }
      case 'time': {
        this.tt += dt;
        const v = timeProfileV(this.tt, this.duration, this.v0, this.runV, this.acc, this.dec);
        this.refV = v; this.refP += v * dt;
        const p = this.pos();
        this.refP = clamp(this.refP, p - 40, p + 40);
        this.pid(this.refP, this.refV, dt);
        if (this.tt >= this.duration) this.finish(ST.READY);
        break;
      }
      case 'ext': this.pid(this.refP, this.refV, dt); break;
    }
    this.lastDuty = this.out.mode === 'duty' ? this.out.duty : 0;
  }
  dutyInt() { return Math.round((this.out.mode === 'duty' ? this.out.duty : 0) * 10000); }
}

// ------------------------------------------------------------ par de motores
function steerSplit(steering, v) {
  const s = clamp(Math.round(steering), -100, 100);
  const k = (50 - Math.abs(s)) / 50;
  return s >= 0 ? [v, v * k] : [v * k, v];
}

export class Pair {
  constructor(hub, L, R) {
    this.hub = hub; this.L = L; this.R = R;   // objetos Motor
    this.mode = 'idle'; this.cmd = null;
  }
  fL() { return -this.L.pos(); }
  fR() { return this.R.pos(); }
  vL() { return -this.L.vf; }
  vR() { return this.R.vf; }
  take() {
    for (const m of [this.L, this.R]) { m.cancel(); m.setMode('ext'); m.ext = this; }
    if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
  }
  release(m) {
    // um motor do par recebeu comando individual: o par deixa de controlar
    if (this.mode !== 'idle') {
      const other = m === this.L ? this.R : this.L;
      if (other.ext === this) { other.ext = null; if (other.mode === 'ext') other.setMode('brake'); }
      if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
      this.mode = 'idle';
    }
  }
  start(kind, o) {
    if (kind === 'speed' && this.mode === 'speed' && !this.cmd && this.L.ext === this && this.R.ext === this) {
      const lim = Math.min(this.L.maxSpeed(), this.R.maxSpeed());
      this.tvL = clamp(o.vL, -lim, lim); this.tvR = clamp(o.vR, -lim, lim);
      this.acc = Math.max(1, o.acc ?? 1000);
      return null;
    }
    const keepL = this.mode !== 'idle' ? this.rvL : this.vL();
    const keepR = this.mode !== 'idle' ? this.rvR : this.vR();
    this.take();
    this.mode = kind;
    this.refL = this.fL(); this.refR = this.fR();
    this.rvL = keepL; this.rvR = keepR;
    this.stopMode = o.stop ?? STOP.BRAKE;
    this.acc = Math.max(1, o.acc ?? 1000); this.dec = Math.max(1, o.dec ?? 1000);
    const lim = Math.min(this.L.maxSpeed(), this.R.maxSpeed());
    let vl = clamp(o.vL, -lim, lim), vr = clamp(o.vR, -lim, lim);
    this.tvL = vl; this.tvR = vr;
    this.tau = 0; this.settleT = 0; this.stallT = 0;
    if (kind === 'speed') return null;
    const cmd = this.hub.newCmd('pair'); this.cmd = cmd;
    const lead = Math.max(Math.abs(vl), Math.abs(vr));
    this.lead = lead;
    this.kL = lead > 0 ? vl / lead : 0; this.kR = lead > 0 ? vr / lead : 0;
    this.L0 = this.refL; this.R0 = this.refR;
    if (kind === 'deg') {
      this.sig = o.deg < 0 ? -1 : 1;
      const u0 = Math.max(0, Math.max(Math.abs(keepL), Math.abs(keepR)));
      this.traj = new Trap(0, Math.abs(o.deg), u0, lead, this.acc, this.dec);
      this.s = 0;
      if (lead < 0.5 || Math.abs(o.deg) < 0.5) this.finish(ST.READY);
    } else if (kind === 'time') {
      this.T = Math.max(0, o.ms) / 1000; this.s = 0; this.sv = 0; this.u0 = Math.max(Math.abs(keepL), Math.abs(keepR));
      if (this.T <= 0 || lead < 0.5) this.finish(ST.READY);
    }
    return cmd;
  }
  finish(status) {
    const cmd = this.cmd; this.cmd = null;
    const mode = this.mode; this.mode = 'idle';
    const tL = mode === 'deg' ? this.L0 + this.sig * this.traj.D * this.kL : this.fL();
    const tR = mode === 'deg' ? this.R0 + this.sig * this.traj.D * this.kR : this.fR();
    for (const m of [this.L, this.R]) { m.ext = null; }
    this.L.applyStop(this.stopMode, -tL); this.R.applyStop(this.stopMode, tR);
    if (cmd) this.hub.finishCmd(cmd, status);
  }
  stop(stop) {
    if (this.mode !== 'idle' || this.L.ext === this || this.R.ext === this) {
      if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
      this.mode = 'idle'; this.L.ext = null; this.R.ext = null;
    }
    this.L.cancel(); this.R.cancel();
    this.L.applyStop(stop, this.L.pos()); this.R.applyStop(stop, this.R.pos());
  }
  // atraso de cada motor em relação à referência, na direção do movimento
  lag() {
    const lL = (this.refL - this.fL()) * Math.sign(this.rvL || this.kL || 1);
    const lR = (this.refR - this.fR()) * Math.sign(this.rvR || this.kR || 1);
    return Math.max(lL, lR);
  }
  kappa() { return clamp(1 - (this.lag() - 6) / 24, 0, 1); }
  control(dt) {
    if (this.mode === 'idle') return;
    const k = this.kappa();
    if (this.mode === 'speed') {
      const dv = this.acc * dt;
      this.rvL += clamp(this.tvL - this.rvL, -dv, dv);
      this.rvR += clamp(this.tvR - this.rvR, -dv, dv);
      this.refL += this.rvL * k * dt; this.refR += this.rvR * k * dt;
      this.refL = clamp(this.refL, this.fL() - 45, this.fL() + 45);
      this.refR = clamp(this.refR, this.fR() - 45, this.fR() + 45);
      this.setRefs(this.refL, this.rvL * k, this.refR, this.rvR * k);
    } else if (this.mode === 'deg') {
      this.tau += k * dt;
      const [s, sv] = this.traj.at(this.tau);
      this.refL = this.L0 + this.sig * s * this.kL; this.refR = this.R0 + this.sig * s * this.kR;
      this.rvL = this.sig * sv * this.kL * k; this.rvR = this.sig * sv * this.kR * k;
      this.setRefs(this.refL, this.rvL, this.refR, this.rvR);
      if (this.tau >= this.traj.T) {
        this.settleT += dt;
        const eL = Math.abs(this.refL - this.fL()), eR = Math.abs(this.refR - this.fR());
        if ((eL <= 5 && eR <= 5) || this.settleT > 1.0) { this.finish(ST.READY); return; }
      }
    } else if (this.mode === 'time') {
      this.tau += dt;
      const u = timeProfileV(this.tau, this.T, this.u0, this.lead, this.acc, this.dec);
      this.s += u * k * dt;
      this.refL = this.L0 + this.s * this.kL; this.refR = this.R0 + this.s * this.kR;
      this.rvL = u * this.kL * k; this.rvR = u * this.kR * k;
      this.setRefs(this.refL, this.rvL, this.refR, this.rvR);
      if (this.tau >= this.T) { this.finish(ST.READY); return; }
    }
    // travamento do par (os dois motores bloqueados)
    if (this.L.stalled && this.R.stalled) this.stallT += dt; else this.stallT = 0;
    if (this.cmd && this.stallT > 0.8) this.finish(ST.STALLED);
  }
  setRefs(pL, vL, pR, vR) {
    this.L.refP = -pL; this.L.refV = -vL;
    this.R.refP = pR; this.R.refV = vR;
  }
}

// ------------------------------------------------------------ DriveBase (Pybricks)
// Controle de distância (mm) e rumo (graus, horário positivo) com perfis
// trapezoidais; opcionalmente corrige o rumo com o giroscópio do hub.
export class DriveBase {
  constructor(hub, L, R, kL, kR, diam, track) {
    this.hub = hub; this.L = L; this.R = R;
    this.kL = kL; this.kR = kR;            // graus do motor por grau "de usuário" (sinal * engrenagem)
    this.D = diam; this.track = track;
    this.mmPerDeg = Math.PI * diam / 360;
    const vmax = Math.min(L.maxSpeed() / Math.abs(kL), R.maxSpeed() / Math.abs(kR)) * this.mmPerDeg;
    this.maxV = vmax;
    this.sp = Math.round(vmax * 0.4); this.sa = Math.round(this.sp * 2.4);
    const trMax = vmax / (track / 2) * 180 / Math.PI;
    this.tr = Math.round(trMax * 0.4); this.ta = Math.round(this.tr * 2.4);
    this.gyro = false; this.gOff = 0;
    this.mode = 'idle'; this.cmd = null;
    this.d0 = 0; this.h0 = 0;                // referência para distance()/angle()
    this.hGyro0 = hub.imu.yawInt;
    this.dRef = 0; this.hRef = 0; this.vd = 0; this.vh = 0;
    this.stallT = 0;
    this.sync();
    this.d0 = this.dist(); this.h0 = this.headEnc();
  }
  // leituras "de usuário" das rodas (graus)
  angL() { return this.L.pos() / this.kL; }
  angR() { return this.R.pos() / this.kR; }
  dist() { return (this.angL() + this.angR()) / 2 * this.mmPerDeg; }
  headEnc() { return (this.angL() - this.angR()) * this.mmPerDeg / this.track * 180 / Math.PI; }
  headGyro() { return -(this.hub.imu.yawInt - this.hGyro0) * 180 / Math.PI; }
  heading() { return this.gyro ? this.headGyro() : this.headEnc(); }
  sync() { this.dRef = this.dist(); this.hRef = this.heading(); this.gOff = this.gyro ? this.headEnc() - this.headGyro() : 0; }
  take() {
    for (const m of [this.L, this.R]) { m.cancel(); m.setMode('ext'); m.ext = this; }
    if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
  }
  release() {
    if (this.mode !== 'idle') {
      for (const m of [this.L, this.R]) if (m.ext === this) { m.ext = null; if (m.mode === 'ext') m.setMode('brake'); }
      if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
      this.mode = 'idle';
    }
  }
  // distância em mm, ângulo em graus (horário positivo)
  start(kind, o) {
    if (kind === 'drive' && this.mode === 'drive' && this.L.ext === this && this.R.ext === this) {
      this.tvd = o.speed; this.tvh = o.rate;
      return null;
    }
    const wasMoving = this.mode === 'drive' || this.mode === 'move';
    const vd0 = wasMoving ? this.vd : 0, vh0 = wasMoving ? this.vh : 0;
    this.take();
    if (!wasMoving) this.sync();
    const d0 = this.dRef, h0 = this.hRef;
    this.then = o.then ?? STOP.HOLD;
    this.tt = 0; this.settleT = 0; this.stallT = 0;
    if (kind === 'drive') {
      this.mode = 'drive'; this.tvd = o.speed; this.tvh = o.rate; this.vd = vd0; this.vh = vh0;
      return null;
    }
    const cmd = this.hub.newCmd('drivebase'); this.cmd = cmd;
    this.mode = 'move';
    let dd = 0, dh = 0;
    if (kind === 'straight') dd = o.distance;
    else if (kind === 'turn') dh = o.angle;
    else if (kind === 'curve') { dh = o.angle; dd = o.radius * o.angle * Math.PI / 180; if (o.radius < 0) dh = -dh; }
    this.D0 = d0; this.H0 = h0; this.dd = dd; this.dh = dh;
    // perfil principal: o eixo que manda
    if (Math.abs(dh) > 1e-6 && (kind !== 'straight')) {
      const rateMax = kind === 'curve' ? Math.min(this.tr, Math.abs(this.sp / (Math.abs(dd / dh) || 1e-9))) : this.tr;
      this.traj = new Trap(0, Math.abs(dh), Math.abs(vh0), rateMax, this.ta, this.ta);
      this.lead = 'h';
    } else {
      this.traj = new Trap(0, Math.abs(dd), Math.abs(vd0), this.sp, this.sa, this.sa);
      this.lead = 'd';
    }
    if (this.traj.T === 0) { this.finish(ST.READY); }
    return cmd;
  }
  finish(status) {
    const cmd = this.cmd; this.cmd = null;
    const th = this.then;
    if (th === STOP.CONTINUE) {
      this.mode = 'drive';
      this.tvd = this.lead === 'd' ? Math.sign(this.dd) * this.sp : (this.dd !== 0 ? this.vd : 0);
      this.tvh = this.lead === 'h' ? this.vh : 0;
    } else if (th === STOP.HOLD) {
      this.mode = 'hold';
    } else {
      this.mode = 'idle';
      for (const m of [this.L, this.R]) { m.ext = null; m.applyStop(th === STOP.COAST || th === STOP.SMART_COAST ? STOP.COAST : STOP.BRAKE, m.pos()); }
    }
    if (cmd) this.hub.finishCmd(cmd, status);
  }
  stop(mode) {
    if (this.cmd) { this.hub.finishCmd(this.cmd, ST.CANCELLED); this.cmd = null; }
    this.mode = 'idle';
    for (const m of [this.L, this.R]) { m.ext = null; m.cancel(); m.applyStop(mode, m.pos()); }
    this.vd = 0; this.vh = 0;
  }
  control(dt) {
    if (this.mode === 'idle') return;
    if (this.mode === 'drive') {
      const ad = this.sa * dt, ah = this.ta * dt;
      this.vd += clamp(this.tvd - this.vd, -ad, ad);
      this.vh += clamp(this.tvh - this.vh, -ah, ah);
      this.dRef += this.vd * dt; this.hRef += this.vh * dt;
      // não deixa a referência fugir muito se o robô estiver preso
      const d = this.dist(); this.dRef = clamp(this.dRef, d - 40, d + 40);
    } else if (this.mode === 'move') {
      // escala de tempo: espera se um motor atrasar demais
      const lagL = Math.abs(this.L.refP - this.L.pos()), lagR = Math.abs(this.R.refP - this.R.pos());
      const k = clamp(1 - (Math.max(lagL, lagR) - 10) / 30, 0, 1);
      this.tt += k * dt;
      const [s, sv] = this.traj.at(this.tt);
      if (this.lead === 'h') {
        const f = this.dh !== 0 ? s / Math.abs(this.dh) : 0;
        this.hRef = this.H0 + Math.sign(this.dh) * s; this.vh = Math.sign(this.dh) * sv * k;
        this.dRef = this.D0 + this.dd * f; this.vd = this.dh !== 0 ? this.dd / Math.abs(this.dh) * sv * k : 0;
      } else {
        this.dRef = this.D0 + Math.sign(this.dd) * s; this.vd = Math.sign(this.dd) * sv * k;
        this.hRef = this.H0; this.vh = 0;
      }
      if (this.tt >= this.traj.T) {
        this.settleT += dt;
        const ed = Math.abs(this.dRef - this.dist()), eh = Math.abs(this.hRef - this.heading());
        if ((ed < 4 && eh < 1.5) || this.settleT > 1.2) { this.vd = 0; this.vh = 0; this.finish(ST.READY); }
      }
    } else if (this.mode === 'hold') { this.vd = 0; this.vh = 0; }
    // correção pelo giroscópio: o alvo das rodas absorve a diferença encoder x giro
    if (this.gyro) {
      const want = this.headEnc() - this.headGyro();
      const md = 25 * dt;   // no máximo 25 graus/s de ajuste
      this.gOff += clamp(want - this.gOff, -md, md);
    } else this.gOff = 0;
    const hr = (this.hRef + this.gOff) * Math.PI / 180 * this.track / 2;
    const sL = (this.dRef + hr) / this.mmPerDeg, sR = (this.dRef - hr) / this.mmPerDeg;
    const vh = this.vh * Math.PI / 180 * this.track / 2;
    const vL = (this.vd + vh) / this.mmPerDeg, vR = (this.vd - vh) / this.mmPerDeg;
    this.L.refP = sL * this.kL; this.L.refV = vL * this.kL;
    this.R.refP = sR * this.kR; this.R.refV = vR * this.kR;
    if (this.L.stalled || this.R.stalled) this.stallT += dt; else this.stallT = 0;
  }
  stalled() { return this.stallT > 0.3; }
  done() { return this.mode !== 'move'; }
  state() {
    return [this.dist() - this.d0, (this.L.vf / this.kL + this.R.vf / this.kR) / 2 * this.mmPerDeg,
      this.heading() - this.h0 - (this.gyro ? 0 : 0), (this.L.vf / this.kL - this.R.vf / this.kR) * this.mmPerDeg / this.track * 180 / Math.PI];
  }
  reset(d, a) {
    this.d0 = this.dist() - d;
    if (this.gyro) this.hGyro0 = this.hub.imu.yawInt + a * Math.PI / 180;
    this.h0 = this.heading() - a;
  }
}

// ------------------------------------------------------------ cores
export const SPIKE_COLORS = {
  '-1': '#000000', 0: '#000000', 1: '#ff2bd6', 2: '#8a2be2', 3: '#1e5bff', 4: '#27b5ff', 5: '#27e0c8',
  6: '#22d64a', 7: '#ffe01a', 8: '#ff8a1a', 9: '#ff2a2a', 10: '#ffffff',
};

// ------------------------------------------------------------ hub
export class Hub {
  constructor(sim, rng, opts = {}) {
    this.sim = sim; this.rng = rng;
    this.T = 0;               // tempo do hub (s)
    this.ports = [null, null, null, null, null, null];
    this.pairs = [null, null, null];
    this.cmds = new Map(); this.cmdSeq = 1; this.cmdEvent = false;
    this.matrix = new Float32Array(25);
    this.orientation = 0;
    this.matrixAnim = null;
    this.lights = { power: 10, connect: 3 };  // branco, azul
    this.buttons = { left: 0, right: 0, center: 0, bt: 0 };   // instante em que foi pressionado (s) ou 0
    this.sound = { volume: 100, cur: null, events: [] };
    this.battery = { soc: opts.soc ?? 0.95, V: 8.1, I: 0.1, temp: 25 };
    this.ctrlAcc = 0;
    const R = opts.realism ?? 1;
    const N = () => (rng && rng.normal ? rng.normal() : 0);
    this.imu = {
      yawInt: 0, yawOff: 0, yawFace: 0, bias: (0.02 + 0.03 * R * Math.abs(N())) * DEG * (N() > 0 ? 1 : -1), scale: 1 + 0.004 * R * N(),
      noise: 0.15 * R * DEG, drift: 0.004 * R * DEG, taps: 0, lastTap: -1, gesture: -1, gestureT: -10, acc: [0, 0, 1000], gyro: [0, 0, 0],
      realism: R,
    };
    this.deviceLights = {};
    this.appEvents = [];
    this.drivebases = [];
    this.stopButton = 'center';
  }
  addDriveBase(lp, rp, kL, kR, D, T) {
    const L = this.motor(lp), R = this.motor(rp);
    if (!L || !R) return -1;
    this.drivebases.push(new DriveBase(this, L, R, kL, kR, D, T));
    return this.drivebases.length - 1;
  }

  // ------- comandos aguardáveis
  newCmd(kind) {
    const c = { id: this.cmdSeq++, kind, status: ST.RUNNING, done: false };
    this.cmds.set(c.id, c);
    return c;
  }
  finishCmd(c, status) {
    if (c.done) return;
    c.done = true; c.status = status; this.cmdEvent = true;
    // limpa comandos antigos
    if (this.cmds.size > 400) { for (const [k, v] of this.cmds) { if (v.done && k < c.id - 200) this.cmds.delete(k); } }
  }
  cmdStatus(id) { const c = this.cmds.get(id); return c ? (c.done ? c.status : ST.RUNNING) : ST.READY; }
  cmdDone(id) { const c = this.cmds.get(id); return !c || c.done; }

  // ------- dispositivos
  attachMotor(portIdx, type, dof) {
    const m = new Motor(this, portIdx, type, dof, this.rng);
    if (dof) dof.motor = m;
    this.ports[portIdx] = m;
    return m;
  }
  attachSensor(portIdx, kind, info) {
    const s = { kind, id: SENSORS[kind].id, port: portIdx, info, lights: [0, 0, 0, 0], cache: null, cacheT: -1 };
    this.ports[portIdx] = s;
    return s;
  }
  detachAll() {
    for (let i = 0; i < 6; i++) { const d = this.ports[i]; if (d && d.kind === 'motor') d.cancel(ST.DISCONNECTED); this.ports[i] = null; }
    this.pairs = [null, null, null];
  }
  dev(p) { return this.ports[p] || null; }
  motor(p) { const d = this.ports[p]; return d && d.kind === 'motor' ? d : null; }

  // ------- par
  pair(idx, l, r) {
    const L = this.motor(l), R = this.motor(r);
    if (!L || !R) return false;
    if (this.pairs[idx]) this.pairs[idx].stop(STOP.COAST);
    this.pairs[idx] = new Pair(this, L, R);
    return true;
  }

  // ------- botões
  press(name, down) {
    if (down) { if (!this.buttons[name]) this.buttons[name] = Math.max(1e-6, this.T); }
    else this.buttons[name] = 0;
  }
  pressedMs(name) { const t = this.buttons[name]; return t ? Math.max(1, Math.round((this.T - t) * 1000)) : 0; }

  // ------- matriz de luz
  matrixClear() { this.matrixAnim && this.cancelAnim(); this.matrix.fill(0); }
  cancelAnim() { if (this.matrixAnim && this.matrixAnim.cmd) this.finishCmd(this.matrixAnim.cmd, ST.CANCELLED); this.matrixAnim = null; }
  setPixel(x, y, v) { this.matrix[y * 5 + x] = clamp(v, 0, 100); }
  getPixel(x, y) { return Math.round(this.matrix[y * 5 + x]); }
  showPixels(arr) { this.cancelAnim(); for (let i = 0; i < 25; i++) this.matrix[i] = clamp(arr[i] || 0, 0, 100); }
  showImage(n, bright = 100) {
    const img = IMAGES[n]; if (!img) return false;
    this.cancelAnim();
    for (let i = 0; i < 25; i++) this.matrix[i] = img[i] * bright / 9;
    return true;
  }
  write(text, intensity = 100, tpc = 500) {
    this.cancelAnim();
    const cmd = this.newCmd('matrix');
    text = String(text);
    // colunas do texto (fonte de largura variável)
    const cols = [];
    for (const chRaw of text) {
      const g = glyphFor(chRaw);
      for (const c of g) cols.push(c);
      cols.push(0);
    }
    const one = [...text].length === 1;
    this.matrixAnim = { cmd, cols, t: 0, intensity: clamp(intensity, 0, 100), tpc: Math.max(20, tpc) / 1000, one, n: [...text].length };
    if (one) { this.drawCols(cols, -Math.floor((5 - (cols.length - 1)) / 2), intensity); }
    return cmd;
  }
  drawCols(cols, off, inten) {
    this.matrix.fill(0);
    for (let x = 0; x < 5; x++) {
      const c = cols[x + off];
      if (!c) continue;
      for (let y = 0; y < 5; y++) if (c & (1 << y)) this.matrix[y * 5 + x] = inten;
    }
  }
  animStep(dt) {
    const a = this.matrixAnim; if (!a) return;
    a.t += dt;
    if (a.one) { if (a.t >= a.tpc) { const c = a.cmd; this.matrixAnim = null; this.finishCmd(c, ST.READY); } return; }
    // rolagem: da direita para a esquerda, uma coluna por passo
    const total = a.cols.length + 5;
    const colT = a.tpc * a.n / Math.max(1, a.cols.length);
    const k = Math.floor(a.t / colT);
    if (k >= total) { this.matrix.fill(0); const c = a.cmd; this.matrixAnim = null; this.finishCmd(c, ST.READY); return; }
    this.drawCols(a.cols, k - 5, a.intensity);
  }
  // pixels físicos (com orientação aplicada), como aparecem no hub
  physicalMatrix() {
    const o = this.orientation, M = this.matrix, out = new Array(25);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      let sx = x, sy = y;
      if (o === 1) { sx = y; sy = 4 - x; }
      else if (o === 2) { sx = 4 - x; sy = 4 - y; }
      else if (o === 3) { sx = 4 - y; sy = x; }
      out[y * 5 + x] = M[sy * 5 + sx];
    }
    return out;
  }

  // ------- som
  beep(freq, ms, vol, wave) {
    if (this.sound.cur && this.sound.cur.cmd) this.finishCmd(this.sound.cur.cmd, ST.CANCELLED);
    const cmd = this.newCmd('sound');
    this.sound.cur = { cmd, end: this.T + Math.max(0, ms) / 1000 };
    this.sound.events.push({ t: 'beep', f: clamp(freq, 20, 20000), ms: Math.max(0, ms), v: clamp(vol, 0, 100) * this.sound.volume / 100, w: wave || 1 });
    return cmd;
  }
  soundStop() {
    if (this.sound.cur && this.sound.cur.cmd) this.finishCmd(this.sound.cur.cmd, ST.CANCELLED);
    this.sound.cur = null; this.sound.events.push({ t: 'stop' });
  }

  // ------- movimento (IMU)
  mountAxes() {
    // eixos do hub (x frente, y esquerda, z topo) no referencial do robô
    const cfg = this.sim.robotCfg ? this.sim.robotCfg.hub : { rot: 0, mount: 'flat' };
    const th = (cfg.rot || 0) * DEG, c = Math.cos(th), s = Math.sin(th);
    if (cfg.mount === 'upright') return { x: [0, 0, 1], y: [-s, c, 0], z: [-c, -s, 0] };
    return { x: [c, s, 0], y: [-s, c, 0], z: [0, 0, 1] };
  }
  faceNormal(face) {
    const a = this.mountAxes();
    const neg = (v) => v.map(q => -q);
    return [a.z, a.x, neg(a.y), neg(a.z), neg(a.x), a.y][face];   // TOP FRONT RIGHT BOTTOM BACK LEFT
  }
  upFace() {
    let best = 0, bv = -2;
    for (let f = 0; f < 6; f++) { const n = this.faceNormal(f); if (n[2] > bv) { bv = n[2]; best = f; } }
    return best;
  }
  imuStep(dt, robot) {
    const im = this.imu;
    const wz = robot && robot.grounded ? robot.body.w : (robot ? robot.body.w : 0);
    const n = this.rng && this.rng.normal ? this.rng.normal() : 0;
    im.bias += (this.rng && this.rng.normal ? this.rng.normal() : 0) * im.drift * Math.sqrt(dt);
    const gz = wz * im.scale + im.bias + n * im.noise;
    const fn = this.faceNormal(im.yawFace);
    im.yawInt += gz * fn[2] * dt;
    // leituras no referencial do hub
    const ax = this.mountAxes();
    const accR = robot ? [robot.acc[0], robot.acc[1], 9.81] : [0, 0, 9.81];
    const w = [0, 0, gz];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const k = 1000 / 9.81;
    const nz = () => (this.rng && this.rng.normal ? this.rng.normal() : 0) * 6 * im.realism;
    im.acc = [dot(ax.x, accR) * k + nz(), dot(ax.y, accR) * k + nz(), dot(ax.z, accR) * k + nz()];
    im.gyro = [dot(ax.x, w) / DEG * 10, dot(ax.y, w) / DEG * 10, dot(ax.z, w) / DEG * 10];
    // toques (impactos)
    if (robot && robot.bumpImpulse > 0.012) {
      if (this.T - im.lastTap > 0.12) {
        im.taps++;
        im.gesture = (this.T - im.lastTap < 0.45) ? 1 : 0; im.gestureT = this.T;
        im.lastTap = this.T;
      }
    }
  }
  yawDeci() { return Math.round(wrap180((this.imu.yawInt - this.imu.yawOff) / DEG) * 10); }
  resetYaw(angleDeci) { this.imu.yawOff = this.imu.yawInt - (angleDeci / 10) * DEG; }
  tilt() {
    // pitch e roll em relação à face de guinada
    const f = this.imu.yawFace, zf = this.faceNormal(f);
    const ax = this.mountAxes();
    let xf = f === 0 || f === 3 ? ax.x : ax.z;
    // garante ortogonalidade
    const d = xf[0] * zf[0] + xf[1] * zf[1] + xf[2] * zf[2];
    xf = [xf[0] - d * zf[0], xf[1] - d * zf[1], xf[2] - d * zf[2]];
    const L = Math.hypot(...xf) || 1; xf = xf.map(q => q / L);
    const yf = [zf[1] * xf[2] - zf[2] * xf[1], zf[2] * xf[0] - zf[0] * xf[2], zf[0] * xf[1] - zf[1] * xf[0]];
    const up = [0, 0, 1];
    const gx = xf[2], gy = yf[2], gz = zf[2];
    const pitch = Math.atan2(gx, Math.hypot(gy, gz)) / DEG;
    const roll = Math.atan2(-gy, gz) / DEG;
    const n = () => (this.rng && this.rng.normal ? this.rng.normal() : 0) * 0.15 * this.imu.realism;
    void up;
    return [this.yawDeci(), Math.round((pitch + n()) * 10), Math.round((roll + n()) * 10)];
  }
  gesture() {
    const im = this.imu;
    if (im.gesture >= 0 && this.T - im.gestureT < 0.5) { const g = im.gesture; return g; }
    return -1;
  }
  stable() {
    const g = this.imu.gyro, a = this.imu.acc;
    return Math.hypot(g[0], g[1], g[2]) < 30 && Math.abs(Math.hypot(a[0], a[1], a[2]) - 1000) < 60;
  }

  // ------- bateria
  batteryStep(dt, Imotors) {
    const b = this.battery;
    const I = 0.09 + (Imotors || 0) * 0.85;
    b.I += 0.05 * (I - b.I);
    const Voc = 7.0 + 1.3 * Math.pow(clamp(b.soc, 0, 1), 0.8);
    b.V = Voc - b.I * 0.18;
    b.soc = Math.max(0, b.soc - b.I * dt / (2.1 * 3600));
    b.temp += ((25 + b.I * 2) - b.temp) * dt / 60;
  }

  // ------- passo do firmware (a cada passo da física)
  step(dt) {
    this.T += dt;
    this.ctrlAcc += dt;
    if (this.ctrlAcc >= CTRL_DT - 1e-9) {
      const cdt = this.ctrlAcc; this.ctrlAcc = 0;
      for (const p of this.pairs) if (p) p.control(cdt);
      for (const d of this.drivebases) d.control(cdt);
      for (const d of this.ports) if (d && d.kind === 'motor') d.control(cdt);
    }
    this.animStep(dt);
    if (this.sound.cur && this.T >= this.sound.cur.end) { const c = this.sound.cur.cmd; this.sound.cur = null; if (c) this.finishCmd(c, ST.READY); }
    this.imuStep(dt, this.sim.robot);
    this.batteryStep(dt, this.sim.robot ? this.sim.robot.motorCurrent : 0);
  }

  // estado do programa terminado: tudo parado, luzes padrão
  resetProgramState() {
    for (const d of this.ports) if (d && d.kind === 'motor') { d.cancel(); d.setMode('coast'); d.gains(); }
    for (let i = 0; i < 3; i++) this.pairs[i] = null;
    this.drivebases = [];
    this.stopButton = 'center';
    this.cancelAnim(); this.matrix.fill(0); this.orientation = 0;
    this.soundStop(); this.sound.volume = 100;
    this.lights.power = 10; this.lights.connect = 3;
    for (const d of this.ports) if (d && d.kind !== 'motor') d.lights = [0, 0, 0, 0];
    this.imu.yawFace = 0;
  }
}

// colunas (bits: linha 0 no bit 0) de um caractere da fonte 5x5
const _glyphCache = new Map();
export function glyphFor(ch) {
  if (_glyphCache.has(ch)) return _glyphCache.get(ch);
  let key = ch;
  const base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
  if (FONT5[base] === undefined) key = base.toUpperCase(); else key = base;
  let rows = FONT5[key];
  if (!rows) rows = FONT5['?'];
  const cols = [];
  for (let x = 0; x < 5; x++) {
    let c = 0;
    for (let y = 0; y < 5; y++) if (rows[y][x] === '1') c |= 1 << y;
    cols.push(c);
  }
  // largura variável: remove colunas vazias à direita (mínimo 1; espaço = 3)
  let w = 5; while (w > 1 && cols[w - 1] === 0) w--;
  let s = 0; while (s < w - 1 && cols[s] === 0) s++;
  const out = ch === ' ' ? [0, 0] : cols.slice(s, w);
  _glyphCache.set(ch, out);
  return out;
}
export { PORTS };
