// ============================================================================
//  MyFLL.lab :: worker.js
//  Laço de simulação em um Web Worker: física a 1 kHz em tempo virtual,
//  agendador do Python, ritmo de tempo real e envio de quadros para a tela.
// ============================================================================
import { Sim, DT } from './sim.js';
import { Runtime } from './runtime.js';
import { slotPixels } from '../common/glyphs.js';
import RT_PY from '../py/rt.py';
import SPIKE_PY from '../py/spike.py';
import PYB_PY from '../py/pybricks.py';

let sim = null, rt = null;
let speed = 1, paused = false;
let last = 0, debt = 0, lastFrame = 0, lagging = 0;
let anchorWall = 0, anchorSim = 0;
let outBuf = '', errBuf = '', appBuf = [];
let slot = 0, pyState = 'off';
let hubOff = false;
let syncFrameT = 0;
let lastRealRatio = 1, ratioAcc = [0, 0];

const post = (m, tr) => self.postMessage(m, tr || []);

// ------------------------------------------------------------ espera bloqueante
let sleepArr = null;
try {
  const mem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  sleepArr = new Int32Array(mem.buffer);
  Atomics.wait(sleepArr, 0, 0, 0);
} catch (e) { sleepArr = null; }
function sleepMs(ms) {
  if (ms <= 0) return;
  if (sleepArr) { try { Atomics.wait(sleepArr, 0, 0, ms); return; } catch (e) { sleepArr = null; } }
  const end = performance.now() + ms;
  while (performance.now() < end) { /* espera ativa */ }
}

// ------------------------------------------------------------ ambiente do runtime
const env = {
  out(s, err) {
    if (err) errBuf += s; else outBuf += s;
    if (outBuf.length + errBuf.length > 20000) flushOut();
  },
  app(o) { appBuf.push(o); },
  syncStep() {
    // passo síncrono pedido pelo Python (código que bloqueia)
    sim.step();
    const now = performance.now();
    const target = anchorWall + (sim.hub.T - anchorSim) * 1000 / Math.max(0.05, speed);
    if (speed < 50 && target - now > 2) sleepMs(target - now);
    if (performance.now() - syncFrameT > 33) { syncFrameT = performance.now(); sendFrame(true); }
  },
};

function flushOut() {
  if (outBuf) { post({ t: 'out', s: outBuf, err: false }); outBuf = ''; }
  if (errBuf) { post({ t: 'out', s: errBuf, err: true }); errBuf = ''; }
}

// ------------------------------------------------------------ quadros
function sendFrame(fromSync) {
  const f = sim.snapshot();
  f.t = 'frame';
  f.T = sim.hub.T;
  f.running = rt ? rt.running : false;
  f.sync = !!fromSync;
  f.snd = sim.hub.sound.events.splice(0);
  f.app = appBuf.splice(0);
  f.ratio = lastRealRatio;
  f.slot = slot;
  f.off = hubOff;
  f.stopBtn = sim.hub.stopButton;
  flushOut();
  post(f);
  lastFrame = performance.now();
}

function idleDisplay() {
  const hub = sim.hub;
  hub.cancelAnim();
  const px = slotPixels(slot);
  for (let i = 0; i < 25; i++) hub.matrix[i] = px[i];
}

let replActive = false;
function programEnded(ev) {
  const hub = sim.hub;
  if (replActive) {
    replActive = false;
    flushOut();
    post({ t: 'prog', state: ev.end, line: ev.line || 0, msg: ev.msg || '', repl: true });
    return;
  }
  hub.resetProgramState();
  if (ev.end === 'off') { hubOff = true; }
  idleDisplay();
  flushOut();
  post({ t: 'prog', state: ev.end, line: ev.line || 0, msg: ev.msg || '' });
}

// ------------------------------------------------------------ laço principal
function stepOnce() {
  if (rt && rt.running) {
    const ev = rt.tickProgram();
    if (ev) programEnded(ev);
  }
  sim.step();
}

function loop() {
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (!paused && sim) {
    const want = dt * speed;
    debt += want;
    const t0 = performance.now();
    let done = 0;
    const budget = speed >= 50 ? 60 : 30;
    while (debt >= DT) {
      stepOnce();
      debt -= DT; done += DT;
      if (performance.now() - t0 > budget) { debt = 0; break; }
    }
    ratioAcc[0] += done; ratioAcc[1] += want;
    if (ratioAcc[1] > 0.5) { lastRealRatio = Math.min(1, ratioAcc[0] / ratioAcc[1]); ratioAcc = [0, 0]; }
  }
  anchorWall = performance.now(); anchorSim = sim ? sim.hub.T : 0;
  if (sim && performance.now() - lastFrame >= 15) sendFrame(false);
  setTimeout(loop, speed >= 50 ? 0 : 4);
}

// ------------------------------------------------------------ Python
async function bootPython(url) {
  pyState = 'loading';
  post({ t: 'py', state: 'loading' });
  try {
    importScripts(url + 'pyodide.js');
    rt = new Runtime(sim, env);
    await rt.init(self.loadPyodide, { rt: RT_PY, spike: SPIKE_PY, pybricks: PYB_PY }, { indexURL: url, fullStdLib: false });
    pyState = 'ready';
    post({ t: 'py', state: 'ready', version: rt.py.version });
  } catch (e) {
    pyState = 'error';
    rt = null;
    post({ t: 'py', state: 'error', msg: String(e && e.message || e) });
  }
}

// ------------------------------------------------------------ mensagens
self.onmessage = (e) => {
  const m = e.data;
  switch (m.t) {
    case 'init': {
      sim = new Sim({ seed: m.seed ?? 1234, realism: m.realism ?? 1, soc: m.soc });
      if (m.mat) sim.setMat(m.mat.data, m.mat.W, m.mat.H, m.mat.s);
      if (m.robot) sim.setRobot(m.robot, m.pose ? { x: m.pose.x / 1000, y: m.pose.y / 1000, a: m.pose.a * Math.PI / 180 } : undefined);
      if (m.objects) sim.setObjects(m.objects);
      slot = m.slot || 0;
      idleDisplay();
      last = performance.now();
      loop();
      if (m.pyodideUrl) bootPython(m.pyodideUrl);
      break;
    }
    case 'mat': if (sim) sim.setMat(m.data, m.W, m.H, m.s); break;
    case 'robot': {
      if (!sim) break;
      if (rt && rt.running) { rt.stop(); programEnded({ end: 'stopped' }); }
      const p = m.pose ? { x: m.pose.x / 1000, y: m.pose.y / 1000, a: m.pose.a * Math.PI / 180 } : undefined;
      sim.setRobot(m.cfg, p);
      idleDisplay();
      break;
    }
    case 'objects': if (sim) sim.setObjects(m.list); break;
    case 'moveObj': if (sim) sim.moveObject(m.id, m.x, m.y, m.a); break;
    case 'pose': if (sim) sim.setRobotPose(m.x, m.y, m.a); break;
    case 'grab': if (sim && sim.robot) { sim.robot.grounded = !m.on; } break;
    case 'run': {
      if (!sim) break;
      if (hubOff) hubOff = false;
      if (!rt) { post({ t: 'prog', state: 'error', line: 0, msg: pyState === 'error' ? 'O Python não carregou (sem internet?). Recarregue a página.' : 'O Python ainda está carregando, aguarde alguns segundos.' }); break; }
      if (m.slot !== undefined) slot = m.slot;
      replActive = false;
      const r = rt.start(m.code, m.dialect);
      if (!r.ok) { sim.hub.resetProgramState(); idleDisplay(); post({ t: 'prog', state: 'error', line: r.line, msg: r.msg }); }
      else post({ t: 'prog', state: 'running' });
      break;
    }
    case 'stop': {
      if (rt && rt.running) { rt.stop(); programEnded({ end: 'stopped' }); }
      break;
    }
    case 'repl': {
      if (!rt) { post({ t: 'out', s: 'O Python ainda está carregando.\n', err: true }); break; }
      const wasRunning = rt.running;
      const r = rt.repl(m.line);
      if (r) post({ t: 'out', s: r + '\n', err: true });
      flushOut();
      if (!wasRunning && rt.running) { replActive = true; post({ t: 'prog', state: 'running', repl: true }); }
      break;
    }
    case 'button': if (sim) { sim.hub.press(m.name, m.down); if (hubOff && m.down && m.name === 'center') { hubOff = false; idleDisplay(); } } break;
    case 'force': if (sim) sim.manualForce[m.port] = m.n; break;
    case 'speed': speed = m.v; paused = m.v === 0; break;
    case 'slot': slot = m.n; if (!(rt && rt.running)) idleDisplay(); break;
    case 'tap': if (sim) { const im = sim.hub.imu; im.taps++; im.gesture = (sim.hub.T - im.lastTap < 0.45) ? 1 : 0; im.gestureT = sim.hub.T; im.lastTap = sim.hub.T; } break;
    case 'battery': if (sim) sim.hub.battery.soc = m.soc; break;
    case 'realism': break;
    case 'ping': post({ t: 'pong', id: m.id }); break;
  }
};
