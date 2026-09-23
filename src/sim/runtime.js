// ============================================================================
//  MyFLL.lab :: runtime.js
//  Ponte entre o Python (Pyodide) e o hub simulado: módulo _hw, ciclo de vida
//  dos programas, passo do agendador e passo síncrono (código que bloqueia).
// ============================================================================
import { PORTS } from '../common/catalog.js';
import { STOP } from './hub.js';
import { DEG, clamp, wrap180 } from '../common/rng.js';

export class Runtime {
  constructor(sim, env) {
    this.sim = sim;
    this.env = env;            // { out(text, err), app(obj), pace(), frame(), status(s) }
    this.py = null;
    this.running = false;
    this.wake = 0;
    this.stepFn = null;
    this.dialect = 'spike';
    this.powerOff = false;
  }

  async init(loadPyodide, sources, opts = {}) {
    const py = await loadPyodide(opts);
    this.py = py;
    py.registerJsModule('_hw', this.hwApi());
    py.FS.mkdirTree('/home/pyodide');
    py.FS.writeFile('/home/pyodide/rt.py', sources.rt);
    py.FS.writeFile('/home/pyodide/spike.py', sources.spike);
    py.FS.writeFile('/home/pyodide/pybricks_impl.py', sources.pybricks);
    py.runPython('import sys; sys.path.insert(0, "/home/pyodide"); import rt, spike, pybricks_impl');
    this.rt = py.pyimport('rt');
    this.stepFn = this.rt.step;
    this.startFn = this.rt.start;
    this.errFn = this.rt.error_text;
    this.stopFn = this.rt.stop_all;
    this.replFn = this.rt.repl;
    return py;
  }

  // ------------------------------------------------------------ programa
  start(code, dialect) {
    if (!this.py) return { ok: false, line: 0, msg: 'O Python ainda está carregando.' };
    this.stop(true);
    this.dialect = dialect || 'spike';
    this.sim.hub.resetProgramState();
    this.powerOff = false;
    let r;
    try { r = this.startFn(code, this.dialect); }
    catch (e) { return { ok: false, line: 0, msg: String(e.message || e) }; }
    if (r) {
      const i = r.indexOf('|');
      return { ok: false, line: +r.slice(0, i) || 0, msg: r.slice(i + 1) };
    }
    this.running = true;
    this.wake = 0;
    this.sim.hub.cmdEvent = true;
    return { ok: true };
  }

  // um passo do agendador (antes da física)
  tickProgram() {
    if (!this.running) return null;
    const hub = this.sim.hub;
    const nowMs = hub.T * 1000;
    if (!(nowMs >= this.wake - 1e-6 || hub.cmdEvent)) return null;
    hub.cmdEvent = false;
    let w;
    try { w = this.stepFn(nowMs); }
    catch (e) { this.running = false; return { end: 'error', line: 0, msg: String(e.message || e) }; }
    if (w === -1) { this.running = false; return { end: this.powerOff ? 'off' : 'done' }; }
    if (w === -2) {
      this.running = false;
      const t = this.errFn();
      const i = t.indexOf('|');
      const msg = t.slice(i + 1);
      if (!msg) return { end: this.powerOff ? 'off' : 'done' };
      return { end: 'error', line: +t.slice(0, i) || 0, msg };
    }
    this.wake = w;
    return null;
  }

  stop(silent) {
    if (this.py && this.stopFn) { try { this.stopFn(); } catch (e) { /* ignore */ } }
    const was = this.running;
    this.running = false;
    return was;
  }

  repl(line) {
    if (!this.py) return 'O Python ainda está carregando.';
    let r = '';
    try { r = this.replFn(line); } catch (e) { r = String(e.message || e); }
    if (!r && this.rt && this.rt.S.running) { this.running = true; this.wake = 0; this.sim.hub.cmdEvent = true; }
    return r;
  }

  // ------------------------------------------------------------ _hw
  hwApi() {
    const sim = this.sim, hub = sim.hub, env = this.env, self = this;
    const mot = (p) => hub.motor(p);
    const dev = (p) => hub.dev(p);
    const clampV = (m, v) => clamp(v, -m.maxSpeed(), m.maxSpeed());
    return {
      now: () => hub.T * 1000,
      sync_step: () => { env.syncStep(); },
      out: (s, err) => env.out(s, !!err),
      cmd_done: (id) => hub.cmdDone(id),
      cmd_status: (id) => hub.cmdStatus(id),
      dev_kind: (p) => { const d = dev(p); return d ? d.kind : ''; },
      dev_id: (p) => { const d = dev(p); return d ? d.id : -1; },
      dev_data: (p) => {
        const d = dev(p); if (!d) return '';
        if (d.kind === 'motor') return JSON.stringify([Math.round(d.vf * 100 / d.maxSpeed()), d.relInt(), d.absDeg(), d.dutyInt()]);
        if (d.kind === 'color') { const c = sim.colorRaw(d); return JSON.stringify([c.color, c.refl, ...c.rgbi]); }
        if (d.kind === 'distance') return JSON.stringify([sim.distanceRaw(d)]);
        if (d.kind === 'force') { const f = sim.forceRaw(p); return JSON.stringify([Math.round(f * 10), f >= 0.5 ? 1 : 0]); }
        return '[]';
      },
      // ------- motor
      m_rel: (p) => mot(p).relInt(),
      m_abs: (p) => mot(p).absDeg(),
      m_vel: (p) => mot(p).velInt(),
      m_get_duty: (p) => mot(p).dutyInt(),
      m_reset_rel: (p, v) => { const m = mot(p); m.relOffset = m.rawDeg() - v; if (m.mode === 'hold') m.refP = v; },
      m_run: (p, v, acc) => { const m = mot(p); m.cmdRun(v, acc); },
      m_deg: (p, deg, v, stop, acc, dec) => {
        const m = mot(p);
        const dir = Math.sign(deg || 1) * Math.sign(v || 1);
        const vv = Math.abs(clampV(m, v));
        return m.cmdTraj(m.pos() + dir * Math.abs(deg), vv, stop, acc, dec).id;
      },
      m_time: (p, ms, v, stop, acc, dec) => { const m = mot(p); return m.cmdTime(ms, clampV(m, v), stop, acc, dec).id; },
      m_rel_to: (p, pos, v, stop, acc, dec) => { const m = mot(p); return m.cmdTraj(pos, Math.abs(clampV(m, v)), stop, acc, dec).id; },
      m_abs_to: (p, pos, v, dir, stop, acc, dec) => {
        const m = mot(p);
        const cur = m.rawDeg() + m.absZero;
        const curW = wrap180(cur);
        const tgt = wrap180(pos);
        let d = tgt - curW;
        const cw = ((d % 360) + 360) % 360;       // horário: positivo
        const ccw = cw - 360;
        if (dir === 0) d = cw === 0 ? 0 : cw;
        else if (dir === 1) d = cw === 0 ? 0 : ccw;
        else if (dir === 3) d = Math.abs(cw) >= Math.abs(ccw) ? cw : ccw;
        else d = Math.abs(cw) <= Math.abs(ccw) ? cw : ccw;
        return m.cmdTraj(m.pos() + d, Math.abs(clampV(m, v)), stop, acc, dec).id;
      },
      m_duty: (p, pwm) => mot(p).cmdDuty(pwm / 10000),
      m_stop: (p, stop) => mot(p).cmdStop(stop),
      // extras usados pelo Pybricks
      m_pos_f: (p) => mot(p).pos(),
      m_vel_f: (p) => mot(p).vf,
      m_hold: (p) => mot(p).cmdHold(),
      m_coast: (p) => mot(p).cmdCoast(),
      m_brake: (p) => mot(p).cmdBrake(),
      m_stalled: (p) => { const m = mot(p); return !!m.stalled; },
      m_done: (p) => { const m = mot(p); return !m.cmd && m.mode !== 'run' && m.mode !== 'duty'; },
      m_load: (p) => { const m = mot(p); return m.out.mode === 'duty' ? m.out.duty * m.spec.stall * 1000 : 0; },
      m_traj_pb: (p, target, v, stop, acc, dec) => { const m = mot(p); return m.cmdTraj(target, Math.abs(clampV(m, v)), stop, acc, dec, false).id; },
      m_time_pb: (p, ms, v, stop, acc, dec) => { const m = mot(p); return m.cmdTime(ms, clampV(m, v), stop, acc, dec).id; },
      m_until_stalled: (p, v, duty) => {
        const m = mot(p);
        const c = m.cmdTraj(m.pos() + Math.sign(v || 1) * 1e7, Math.abs(clampV(m, v)), STOP.COAST, 2000, 2000, true);
        m.dutyLimit = duty;
        return c.id;
      },
      m_track: (p, target) => { const m = mot(p); if (m.mode !== 'hold') m.cmdHold(target); m.refP = target; },
      m_set_gains: (p, kp, ki, kd) => { const m = mot(p); m.Kp = kp; m.Ki = ki; m.Kd = kd; },
      m_max: (p) => mot(p).maxSpeed(),
      // ------- par
      p_ok: (i) => !!hub.pairs[i],
      p_pair: (i, l, r) => hub.pair(i, l, r),
      p_unpair: (i) => { if (hub.pairs[i]) hub.pairs[i].stop(STOP.COAST); hub.pairs[i] = null; },
      p_move: (i, st, v, acc) => { const [a, b] = steer(st, v); hub.pairs[i].start('speed', { vL: a, vR: b, acc }); },
      p_move_deg: (i, deg, st, v, stop, acc, dec) => { const [a, b] = steer(st, v); return hub.pairs[i].start('deg', { deg, vL: a, vR: b, stop, acc, dec }).id; },
      p_move_time: (i, ms, st, v, stop, acc, dec) => { const [a, b] = steer(st, v); return hub.pairs[i].start('time', { ms, vL: a, vR: b, stop, acc, dec }).id; },
      p_tank: (i, vl, vr, acc) => hub.pairs[i].start('speed', { vL: vl, vR: vr, acc }),
      p_tank_deg: (i, deg, vl, vr, stop, acc, dec) => hub.pairs[i].start('deg', { deg, vL: vl, vR: vr, stop, acc, dec }).id,
      p_tank_time: (i, ms, vl, vr, stop, acc, dec) => hub.pairs[i].start('time', { ms, vL: vl, vR: vr, stop, acc, dec }).id,
      p_stop: (i, stop) => hub.pairs[i].stop(stop),
      // ------- sensores
      c_color: (p) => sim.colorRaw(dev(p)).color,
      c_refl: (p) => sim.colorRaw(dev(p)).refl,
      c_rgbi: (p) => JSON.stringify(sim.colorRaw(dev(p)).rgbi),
      c_hsv: (p) => { const c = sim.colorRaw(dev(p)); return JSON.stringify([c.hsv[0], c.hsv[1] * 100, c.hsv[2] * 100]); },
      c_ambient: (p) => { const c = sim.colorRaw(dev(p)); return Math.round(6 + 4 * c.gain + (sim.sensorNoise() - 0.5)); },
      c_light: (p, a, b, c) => { const d = dev(p); d.lights = [a, b, c, 0]; },
      d_dist: (p) => sim.distanceRaw(dev(p)),
      d_lights: (p, a, b, c, d) => { dev(p).lights = [a, b, c, d]; },
      d_light: (p, i, v) => { dev(p).lights[i] = v; },
      d_get_light: (p, i) => dev(p).lights[i] || 0,
      f_force: (p) => sim.forceRaw(p),
      f_travel: (p) => { const f = sim.forceRaw(p); return clamp(f * 0.8, 0, 8); },
      // ------- matriz, luzes, botões, som
      lm_show: (js) => hub.showPixels(JSON.parse(js)),
      lm_set: (x, y, v) => { hub.cancelAnim(); hub.setPixel(x, y, v); },
      lm_get: (x, y) => hub.getPixel(x, y),
      lm_clear: () => hub.matrixClear(),
      lm_image: (n) => hub.showImage(n),
      lm_image_px: (js) => hub.showPixels(JSON.parse(js)),
      lm_write: (t, inten, tpc) => hub.write(t, inten, tpc).id,
      lm_orient: (o) => { hub.orientation = o; },
      lm_get_orient: () => hub.orientation,
      light: (w, c) => { if (w === 0) hub.lights.power = c; else hub.lights.connect = c; },
      light_rgb: (w, hex) => { if (w === 0) hub.lights.power = hex; else hub.lights.connect = hex; },
      btn: (name) => hub.pressedMs(name),
      btn_set: (name) => { hub.stopButton = name; },
      beep: (f, ms, v, w) => hub.beep(f, ms, v, w).id,
      sound_stop: () => hub.soundStop(),
      volume: (v) => { hub.sound.volume = clamp(v, 0, 100); },
      // ------- movimento
      imu_tilt: () => JSON.stringify(hub.tilt()),
      imu_acc: () => JSON.stringify(hub.imu.acc.map(Math.round)),
      imu_gyro: () => JSON.stringify(hub.imu.gyro.map(Math.round)),
      imu_reset_yaw: (d) => hub.resetYaw(d),
      imu_set_face: (f) => { const y = hub.yawDeci(); hub.imu.yawFace = f; hub.resetYaw(y); },
      imu_get_face: () => hub.imu.yawFace,
      imu_up: () => hub.upFace(),
      imu_gesture: () => hub.gesture(),
      imu_taps: () => hub.imu.taps,
      imu_reset_taps: () => { hub.imu.taps = 0; },
      imu_stable: () => hub.stable(),
      imu_heading_raw: () => (hub.imu.yawInt / DEG),
      imu_quat: () => {
        const y = (hub.imu.yawInt - hub.imu.yawOff) / 2;
        return JSON.stringify([Math.cos(y), 0, 0, Math.sin(y)]);
      },
      hub_temp: () => Math.round(hub.battery.temp * 10),
      batt_v: () => hub.battery.V,
      batt_i: () => hub.battery.I,
      power_off: () => { self.powerOff = true; },
      app: (js) => { try { env.app(JSON.parse(js)); } catch (e) { /* ignore */ } },
      // ------- DriveBase (Pybricks)
      db_new: (lp, rp, kL, kR, D, T) => hub.addDriveBase(lp, rp, kL, kR, D, T),
      db_straight: (i, mm, then) => hub.drivebases[i].start('straight', { distance: mm, then }).id,
      db_turn: (i, deg, then) => hub.drivebases[i].start('turn', { angle: deg, then }).id,
      db_curve: (i, r, deg, then) => hub.drivebases[i].start('curve', { radius: r, angle: deg, then }).id,
      db_drive: (i, v, rate) => { hub.drivebases[i].start('drive', { speed: v, rate }); },
      db_stop: (i, mode) => hub.drivebases[i].stop(mode),
      db_settings: (i, sp, sa, tr, ta) => {
        const d = hub.drivebases[i];
        if (sp >= 0) d.sp = sp; if (sa >= 0) d.sa = sa; if (tr >= 0) d.tr = tr; if (ta >= 0) d.ta = ta;
        return JSON.stringify([d.sp, d.sa, d.tr, d.ta]);
      },
      db_state: (i) => JSON.stringify(hub.drivebases[i].state()),
      db_reset: (i, dist, ang) => hub.drivebases[i].reset(dist, ang),
      db_gyro: (i, on) => {
        const d = hub.drivebases[i];
        const a = d.heading() - d.h0;
        d.gyro = !!on;
        d.hGyro0 = hub.imu.yawInt + d.headEnc() * Math.PI / 180;
        d.gOff = 0;
        d.h0 = d.heading() - a;
        d.hRef = d.heading();
      },
      db_done: (i) => hub.drivebases[i].done(),
      db_stalled: (i) => hub.drivebases[i].stalled(),
      pb_heading: () => -(hub.imu.yawInt - hub.imu.yawOff) * 180 / Math.PI,
      pb_reset_heading: (a) => { hub.imu.yawOff = hub.imu.yawInt + a * Math.PI / 180; },
      stop_button: (name) => { hub.stopButton = name; },
      get_stop_button: () => hub.stopButton,
      pb_display: (js) => hub.showPixels(JSON.parse(js)),
    };
  }
}

function steer(steering, v) {
  const s = clamp(Math.round(steering), -100, 100);
  const k = (50 - Math.abs(s)) / 50;
  return s >= 0 ? [v, v * k] : [v * k, v];
}

export { PORTS };
