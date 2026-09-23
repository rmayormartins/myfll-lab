// ============================================================================
//  MyFLL.lab :: app.js
//  Orquestra a interface: estado, worker de simulação, vista 3D, hub, console,
//  editor com 20 programas, montador, mesa, missões, exemplos e manual.
// ============================================================================
import { $, $$, el, toast, modal, store, download, pickFile, fmt, tabs, SPIKE_NAME } from './ui.js';
import { View3D } from './view3d.js';
import { HubPanel } from './hubpanel.js';
import { Editor } from './editor.js';
import { makeMatCanvas, paintMat, matRGB } from './matpaint.js';
import { TEMPLATES, generateSeason, HOME_W, HOME_E } from './mapgen.js';
import { Missions, robotCorners, inAnyHome } from './missions.js';
import { Builder } from './builder.js';
import { MapEditor } from './mapeditor.js';
import { EXAMPLES, STARTER } from './examples.js';
import { renderManual } from './manual.js';
import { DataPanel } from './datapanel.js';
import { Audio } from './audio.js';
import { complete } from './apidata.js';
import { defaultRobot, layoutRobot, deepClone, validateRobot, PORTS } from '../common/catalog.js';
import { OBJ_TYPES, objRadius } from '../common/objects.js';

const SAVE_KEY = 'myfll.v1';
const NSLOTS = 20;

class App {
  constructor() {
    this.frame = null;
    this.running = false;
    this.runSlot = null;
    this.pyState = 'loading';
    this.state = this.load();
    this.saveT = 0;
    this.audio = new Audio();
    this.initUI();
    this.initWorker();
  }

  // ------------------------------------------------------------ estado
  defaults() {
    const field = generateSeason(2025, { theme: 'oceano', count: 7 });
    const slots = [];
    for (let i = 0; i < NSLOTS; i++) slots.push({ name: i === 0 ? 'Primeiro programa' : '', dialect: 'spike', code: i === 0 ? STARTER : '' });
    return {
      v: 1, robot: defaultRobot(), map: field.map, objects: field.objects, missions: field.missions,
      start: { x: 200, y: 240, a: 0 }, slots, slot: 0, hubSlot: 0,
      settings: { realism: 1, seed: 1234, battery: 0.95, sound: true, trail: true, sensors: true },
    };
  }
  load() {
    const d = this.defaults();
    const s = store.get(SAVE_KEY, null);
    if (!s || s.v !== 1) return d;
    const st = Object.assign(d, s);
    st.settings = Object.assign(this.defaults().settings, s.settings || {});
    while (st.slots.length < NSLOTS) st.slots.push({ name: '', dialect: 'spike', code: '' });
    return st;
  }
  saveSoon() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      if (!store.set(SAVE_KEY, this.state)) this._warnedSave || (this._warnedSave = true, toast('Não foi possível salvar no navegador (modo privado?). Use ☰ para exportar o projeto.', 'warn', 5000));
    }, 700);
  }

  // ------------------------------------------------------------ interface
  initUI() {
    const st = this.state;
    tabs($('#left'), (id) => { if (this.mapEd) this.mapEd.setActive(id === 'map'); if (id === 'robot' && this.builder) requestAnimationFrame(() => this.builder.draw()); });
    tabs($('#right'), (id) => { if (id === 'data' && this.data) this.data.resize(); });
    // tapete
    this.matCanvas = makeMatCanvas();
    // vista 3D
    this.view = new View3D($('#view'), {
      down: (p, e) => this.onDown(p, e), move: (p, e) => this.onMove(p, e), up: (p, e) => this.onUp(p, e),
      hover: (p, e) => this.onHover(p, e), dbl: (p, e) => this.mapEd && this.mapEd.dbl(p, e),
    });
    this.view.flags.trail = st.settings.trail; this.view.flags.sensors = st.settings.sensors;
    this.repaintMat(false);
    this.view.setMatCanvas(this.matCanvas);
    this.view.buildRobot(st.robot);
    this.view.setObjects(st.objects);
    this.buildHudTR();
    // hub
    this.hub = new HubPanel($('#hubpanel'), {
      button: (name, down) => this.hubButton(name, down),
      force: (port, n) => this.send({ t: 'force', port, n }),
      tap: () => this.send({ t: 'tap' }),
    });
    // console
    this.conOut = $('#conOut');
    this.conHist = store.get('myfll.hist', []); this.conHi = -1; this.conBuf = [];
    $('#bConClear').onclick = () => { this.conOut.innerHTML = ''; };
    const inp = $('#conIn');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const line = inp.value;
        if (line.trim()) { this.conHist.unshift(line); this.conHist = this.conHist.slice(0, 60); store.set('myfll.hist', this.conHist); }
        this.conHi = -1; inp.value = '';
        const cont = this.conBuf.length > 0;
        this.print((cont ? '... ' : '>>> ') + line + '\n', 'i');
        if (cont || /:\s*(#.*)?$/.test(line)) {
          if (line.trim() === '' && cont) { const src = this.conBuf.join('\n'); this.conBuf = []; $('.conin span').textContent = '>>>'; this.send({ t: 'repl', line: src + '\n' }); }
          else { this.conBuf.push(line); $('.conin span').textContent = '...'; }
          return;
        }
        if (line.trim()) this.send({ t: 'repl', line });
      } else if (e.key === 'ArrowUp') { if (this.conHi < this.conHist.length - 1) { this.conHi++; inp.value = this.conHist[this.conHi]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (this.conHi > 0) { this.conHi--; inp.value = this.conHist[this.conHi]; } else { this.conHi = -1; inp.value = ''; } e.preventDefault(); }
    });
    // código
    this.buildCodePane();
    // painéis
    this.builder = new Builder(this, $('#pane-robot'));
    this.mapEd = new MapEditor(this, $('#pane-map'));
    this.missions = new Missions(this);
    this.missions.mount($('#pane-mis'));
    this.buildExamples();
    renderManual($('#pane-doc'));
    this.data = new DataPanel($('#pane-data'), this);
    // topo
    $('#bRun').onclick = () => this.runCurrent();
    $('#bStop').onclick = () => this.stopProgram();
    $('#sSpeed').onchange = (e) => this.send({ t: 'speed', v: +e.target.value });
    $('#bResetField').onclick = () => this.resetField();
    $('#bMenu').onclick = () => this.menu();
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => { if (this.saveT) { clearTimeout(this.saveT); store.set(SAVE_KEY, this.state); } });
  }

  buildHudTR() {
    const tr = $('#hudTR');
    const cams = [['orbit', '3D'], ['top', 'Topo'], ['follow', 'Seguir'], ['robot', 'Robô']];
    const camRow = el('div', { class: 'toggles' });
    for (const [m, t] of cams) {
      const b = el('button', { class: 'tg' + (m === 'orbit' ? ' on' : ''), title: 'Câmera: ' + t }, t);
      b.onclick = () => { this.view.setMode(m); $$('button', camRow).forEach(x => x.classList.toggle('on', x === b)); };
      camRow.appendChild(b);
    }
    const tg = (label, key, color) => {
      const b = el('button', { class: 'tg' + (this.view.flags[key] ? ' on' : '') }, el('span', { class: 'sw', style: { background: color } }), label);
      b.onclick = () => { this.view.flags[key] = !this.view.flags[key]; b.classList.toggle('on', this.view.flags[key]); this.state.settings[key] = this.view.flags[key]; this.saveSoon(); };
      return b;
    };
    const tgRow = el('div', { class: 'toggles' }, tg('trilha', 'trail', '#ff7a1a'), tg('sensores', 'sensors', '#ff4d6d'),
      el('button', { class: 'tg', title: 'Apaga a trilha', onclick: () => this.view.clearTrail() }, 'limpar trilha'),
      el('button', { class: 'tg', title: 'Usa a posição atual do robô como início', onclick: () => this.setStartHere() }, 'definir início'));
    tr.append(camRow, tgRow);
  }

  // ------------------------------------------------------------ código
  buildCodePane() {
    const st = this.state;
    const pane = $('#pane-code');
    this.slotSel = el('select', { class: 'btn sm', title: 'Programa (posição no hub, 0 a 19)' });
    this.fillSlots();
    this.slotSel.onchange = () => this.selectSlot(+this.slotSel.value);
    this.dialSeg = el('div', { class: 'seg', title: 'Linguagem do programa' },
      el('button', { 'data-d': 'spike' }, 'SPIKE 3'), el('button', { 'data-d': 'pybricks' }, 'Pybricks'));
    $$('button', this.dialSeg).forEach(b => b.onclick = () => { this.curSlot().dialect = b.dataset.d; this.updDial(); this.saveSoon(); });
    const ren = el('button', { class: 'btn sm', title: 'Renomear programa', onclick: async () => {
      const inp = el('input', { type: 'text', value: this.curSlot().name || '' });
      const v = await modal('Nome do programa', inp, [{ label: 'Cancelar', value: null }, { label: 'Salvar', cls: 'pri', value: 'ok' }]);
      if (v === 'ok') { this.curSlot().name = inp.value.slice(0, 40); this.fillSlots(); this.saveSoon(); }
    } }, '✎');
    const dl = el('button', { class: 'btn sm', title: 'Baixar como arquivo .py', onclick: () => download(`programa${st.slot}.py`, this.editor.value, 'text/x-python') }, '⤓ .py');
    const ul = el('button', { class: 'btn sm', title: 'Abrir arquivo .py neste programa', onclick: async () => {
      const f = await pickFile('.py,.txt'); if (!f) return;
      this.editor.value = f.text; this.curSlot().code = f.text; if (!this.curSlot().name) this.curSlot().name = f.name.replace(/\.\w+$/, '');
      if (/pybricks/.test(f.text)) this.curSlot().dialect = 'pybricks';
      this.fillSlots(); this.updDial(); this.saveSoon();
    } }, '⤒');
    pane.appendChild(el('div', { class: 'progbar' }, this.slotSel, ren, this.dialSeg, dl, ul));
    this.editor = new Editor(pane, {
      onChange: (v) => { this.curSlot().code = v; this.saveSoon(); if (this.editor.errLine) this.editor.setError(0); },
      onRun: () => this.runCurrent(),
      onSave: () => { store.set(SAVE_KEY, this.state); toast('Salvo no navegador.', 'ok', 1500); },
      onCursor: (ln, col) => { this.cursorInfo.textContent = `linha ${ln}, col ${col}`; },
      complete: (obj, pre, src) => complete(obj, pre, src, this.curSlot().dialect),
    });
    this.statusEl = el('span', { class: 'st' }, 'parado');
    this.cursorInfo = el('span', {}, 'linha 1, col 1');
    pane.appendChild(el('div', { class: 'progstat' }, this.statusEl, this.cursorInfo, el('span', { style: { flex: 1 } }), el('span', {}, 'Ctrl+Enter executa · Ctrl+/ comenta · Ctrl+Espaço sugere')));
    this.editor.value = this.curSlot().code || '';
    this.updDial();
  }
  curSlot() { return this.state.slots[this.state.slot]; }
  fillSlots() {
    const st = this.state;
    this.slotSel.innerHTML = '';
    st.slots.forEach((s, i) => this.slotSel.appendChild(el('option', { value: i, selected: i === st.slot }, `${i} · ${s.name || (s.code.trim() ? 'sem nome' : 'vazio')}`)));
  }
  selectSlot(i) {
    this.state.slot = i;
    this.editor.value = this.curSlot().code || '';
    this.fillSlots(); this.updDial(); this.saveSoon();
  }
  updDial() {
    const d = this.curSlot().dialect || 'spike';
    $$('button', this.dialSeg).forEach(b => b.classList.toggle('on', b.dataset.d === d));
  }

  // ------------------------------------------------------------ exemplos
  buildExamples() {
    const pane = $('#pane-ex');
    pane.innerHTML = '';
    const wrap = el('div', { class: 'cards' });
    wrap.appendChild(el('p', { class: 'hint', style: { margin: '0 2px' } }, 'Clique para carregar no programa atual. Os exemplos usam o robô "Base de competição" (rodas nas portas A e B, cor em C e D, braço em E, distância em F).'));
    let grp = '';
    for (const ex of EXAMPLES) {
      if (ex.group !== grp) { grp = ex.group; wrap.appendChild(el('div', { class: 'grp' }, grp)); }
      const c = el('div', { class: 'card click' },
        el('h3', {}, ex.title),
        el('p', {}, ex.desc),
        el('div', { class: 'tags' }, el('span', { class: 'tag ' + (ex.dialect === 'pybricks' ? 'v' : 'y') }, ex.dialect === 'pybricks' ? 'Pybricks' : 'SPIKE 3'), ...(ex.tags || []).map(t => el('span', { class: 'tag' }, t))));
      c.onclick = async () => {
        const s = this.curSlot();
        if (s.code.trim() && s.code !== ex.code) {
          const v = await modal('Carregar exemplo', `O programa ${this.state.slot} já tem código. Substituir por "${ex.title}"?`, [{ label: 'Cancelar', value: null }, { label: 'Usar o próximo vazio', value: 'next' }, { label: 'Substituir', cls: 'warn', value: 'ok' }]);
          if (!v) return;
          if (v === 'next') { const i = this.state.slots.findIndex(q => !q.code.trim()); if (i < 0) return toast('Todos os 20 programas estão ocupados.', 'warn'); this.selectSlot(i); }
        }
        const t = this.curSlot();
        t.code = ex.code; t.name = ex.title; t.dialect = ex.dialect || 'spike';
        this.editor.value = ex.code; this.fillSlots(); this.updDial(); this.saveSoon();
        if (ex.robot && JSON.stringify(ex.robot) !== JSON.stringify(this.state.robot.name)) { /* dica */ }
        $$('#right .tab').find(b => b.dataset.tab === 'code').click();
        toast(`Exemplo "${ex.title}" no programa ${this.state.slot}. Clique ▶ EXECUTAR.`, 'ok');
      };
      wrap.appendChild(c);
    }
    pane.appendChild(wrap);
  }

  // ------------------------------------------------------------ worker
  initWorker() {
    const st = this.state;
    const blob = new Blob([__WORKER_SRC__], { type: 'text/javascript' });
    this.workerUrl = URL.createObjectURL(blob);
    this.spawnWorker(true);
  }
  spawnWorker(first) {
    const st = this.state;
    if (this.worker) this.worker.terminate();
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = (e) => this.onMsg(e.data);
    this.worker.onerror = (e) => { console.error(e); toast('Erro no simulador: ' + (e.message || e), 'err', 6000); };
    const mat = matRGB(this.matCanvas);
    const pose = this.frame && this.frame.robot ? { x: this.frame.robot.x, y: this.frame.robot.y, a: this.frame.robot.a * 180 / Math.PI } : st.start;
    this.worker.postMessage({ t: 'init', robot: st.robot, objects: first ? st.objects : this.currentObjectDefs(), mat, pose, seed: st.settings.seed, realism: st.settings.realism,
      soc: st.settings.battery, slot: st.hubSlot, pyodideUrl: __PYODIDE_URL__ }, [mat.data.buffer]);
    this.send({ t: 'speed', v: +$('#sSpeed').value });
  }
  send(m, tr) { if (this.worker) this.worker.postMessage(m, tr || []); }

  onMsg(m) {
    switch (m.t) {
      case 'frame': this.onFrame(m); break;
      case 'out': this.print(m.s, m.err ? 'e' : ''); break;
      case 'py': this.onPy(m); break;
      case 'prog': this.onProg(m); break;
      case 'pong': if (this._pong) this._pong(m.id); break;
    }
  }

  onPy(m) {
    this.pyState = m.state;
    const c = $('#cPy');
    if (m.state === 'ready') {
      c.className = 'chip ok'; c.querySelector('b').textContent = 'pronto';
      if (!this._pyOnce) { this._pyOnce = true; this.print(`MicroPython simulado pronto (Pyodide ${m.version}). Programe em SPIKE 3 ou Pybricks.\n`, 's'); }
      if (this._runQueued) { const q = this._runQueued; this._runQueued = null; this.startRun(q.slot); }
    } else if (m.state === 'error') {
      c.className = 'chip bad'; c.querySelector('b').textContent = 'erro';
      this.print('Não foi possível carregar o Python (' + m.msg + '). Verifique a internet e recarregue a página.\n', 'e');
    } else { c.className = 'chip warn'; c.querySelector('b').textContent = 'carregando'; }
  }

  onProg(m) {
    const c = $('#cProg');
    if (m.state === 'running') {
      this.running = true;
      c.className = 'chip ok'; c.querySelector('b').textContent = m.repl ? 'console' : 'rodando ' + (this.runSlot ?? '');
      this.statusEl.className = 'st run'; this.statusEl.textContent = 'rodando';
      return;
    }
    this.running = false;
    clearTimeout(this._stopWatch);
    c.className = 'chip' + (m.state === 'error' ? ' bad' : ''); c.querySelector('b').textContent = m.state === 'error' ? 'erro' : 'parado';
    if (m.repl) {
      this.statusEl.className = 'st'; this.statusEl.textContent = 'parado';
      if (m.state === 'error' && m.msg) this.print(m.msg.replace(/programa/g, 'console') + '\n', 'e');
      return;
    }
    this.statusEl.className = 'st' + (m.state === 'error' ? ' err' : ''); this.statusEl.textContent = m.state === 'error' ? 'erro' + (m.line ? ' na linha ' + m.line : '') : 'parado';
    if (m.state === 'error') {
      this.print(m.msg + '\n', 'e');
      if (m.line && this.runSlot === this.state.slot) { this.editor.setError(m.line); }
      toast(m.line ? `Erro na linha ${m.line}. Veja o console.` : 'Erro no programa. Veja o console.', 'err', 3500);
      this.audio.error();
    } else if (m.state === 'done') this.print('[programa terminou]\n', 's');
    else if (m.state === 'stopped') this.print('[programa interrompido]\n', 's');
    else if (m.state === 'off') this.print('[hub desligado: aperte o botão central para ligar]\n', 's');
  }

  onFrame(f) {
    this.frame = f;
    this.view.update(f);
    this.hub.update(f);
    if (f.snd && f.snd.length && this.state.settings.sound) for (const s of f.snd) this.audio.event(s);
    if (f.app && f.app.length) for (const a of f.app) { this.data.appEvent(a); this.audio.app(a); }
    // missões
    this.missions.tick(f);
    this.missions.evaluate(f);
    this.missions.update();
    $('#matchHud').innerHTML = this.missions.hudHtml();
    // chips e HUD
    $('#cTime b').textContent = fmt(f.T, 1) + ' s';
    const b = $('#cBatt'); b.querySelector('b').textContent = f.hub.batt + '%'; b.className = 'chip ' + (f.hub.batt > 30 ? 'ok' : (f.hub.batt > 12 ? 'warn' : 'bad'));
    $('#cScore b').textContent = String(this.missions.total);
    const rt = $('#cRT'); rt.querySelector('b').textContent = Math.round((f.ratio || 1) * 100) + '%'; rt.className = 'chip opt ' + ((f.ratio || 1) > 0.9 ? 'info' : 'warn');
    if (f.robot) {
      const r = f.robot, v = Math.hypot(r.vx, r.vy) * 1000;
      const hd = ((r.a * 180 / Math.PI) % 360 + 360) % 360;
      $('#hudPose').innerHTML = `x <span>${Math.round(r.x)}</span> y <span>${Math.round(r.y)}</span> mm · rumo <span>${fmt(hd, 1)}°</span> · <span>${Math.round(v)}</span> mm/s${this.running ? ' · <b>programa ' + (this.runSlot ?? '') + '</b>' : ''}`;
    }
    this.data.frame(f);
    if (this.dragging && this.dragging.kind === 'robot') this.hudDragInfo();
  }

  print(s, cls = '') {
    const o = this.conOut;
    const atBottom = o.scrollTop + o.clientHeight >= o.scrollHeight - 30;
    if (cls) o.appendChild(el('span', { class: cls }, s)); else o.appendChild(document.createTextNode(s));
    while (o.childNodes.length > 1500) o.removeChild(o.firstChild);
    if (atBottom) o.scrollTop = o.scrollHeight;
  }

  // ------------------------------------------------------------ execução
  runCurrent() {
    this.startRun(this.state.slot);
  }
  startRun(slot) {
    const s = this.state.slots[slot];
    if (!s || !s.code.trim()) { toast(`O programa ${slot} está vazio.`, 'warn'); return; }
    if (this.pyState !== 'ready') {
      if (this.pyState === 'error') { toast('O Python não carregou. Recarregue a página com internet.', 'err'); return; }
      this._runQueued = { slot }; toast('Carregando o Python do hub... o programa começa em seguida.', '', 3000); return;
    }
    this.editor.setError(0);
    this.runSlot = slot;
    this.state.hubSlot = slot;
    this.send({ t: 'run', code: s.code, dialect: s.dialect || 'spike', slot });
    this.print(`\n▶ programa ${slot}${s.name ? ' · ' + s.name : ''} (${s.dialect === 'pybricks' ? 'Pybricks' : 'SPIKE 3'})\n`, 'ok');
    this.saveSoon();
  }
  stopProgram(silent) {
    if (!this.running && silent) { this.send({ t: 'stop' }); return; }
    this.send({ t: 'stop' });
    // cão de guarda: código preso em laço síncrono não recebe mensagens
    clearTimeout(this._stopWatch);
    if (this.running) this._stopWatch = setTimeout(() => {
      if (!this.running) return;
      this.print('[o programa não respondeu: reiniciando o hub]\n', 'e');
      this.running = false;
      this.pyState = 'loading'; this.onPy({ state: 'loading' });
      this.spawnWorker(false);
      this.onProg({ state: 'stopped' });
    }, 900);
  }

  hubButton(name, down) {
    const st = this.state;
    if (name === 'center' && down) {
      if (this.frame && this.frame.off) { this.send({ t: 'button', name, down }); return; }
      if (this.running) {
        this.send({ t: 'button', name, down });
        const sb = (this.frame && this.frame.stopBtn) || 'center';
        if (sb.split('+').includes('center')) this.stopProgram();
        return;
      }
      this.send({ t: 'button', name, down });
      this.startRun(st.hubSlot);
      return;
    }
    this.send({ t: 'button', name, down });
    if (!this.running && down && (name === 'left' || name === 'right')) {
      st.hubSlot = (st.hubSlot + (name === 'left' ? NSLOTS - 1 : 1)) % NSLOTS;
      this.send({ t: 'slot', n: st.hubSlot });
      const s = st.slots[st.hubSlot];
      toast(`Hub: programa ${st.hubSlot}${s.name ? ' · ' + s.name : (s.code.trim() ? '' : ' (vazio)')}`, '', 1400);
      this.audio.click();
      this.saveSoon();
    }
  }

  // ------------------------------------------------------------ mesa
  repaintMat(send = true) {
    paintMat(this.matCanvas, this.state.map, { selected: this.mapEd ? this.mapEd.selItem() : null });
    if (this.view) this.view.matChanged();
    if (send && this.worker) {
      clearTimeout(this._matT);
      this._matT = setTimeout(() => { const m = matRGB(this.matCanvas); this.send(Object.assign({ t: 'mat' }, m), [m.data.buffer]); }, 60);
    }
  }
  currentObjectDefs() {
    // posições atuais (depois de empurrões) para recriar o worker sem perder a mesa
    const f = this.frame;
    return this.state.objects.map(d => {
      const o = f && f.objs ? f.objs.find(q => q.id === d.id) : null;
      if (!o || o.x === undefined || ['alavanca', 'empurrador', 'botao', 'bandeira', 'marcador', 'parede'].includes(d.type)) return d;
      return Object.assign({}, d, { x: o.x, y: o.y, a: o.a * 180 / Math.PI });
    });
  }
  loadField(r, resetScore) {
    const st = this.state;
    st.map = r.map; st.objects = r.objects || []; st.missions = r.missions || [];
    if (this.mapEd) this.mapEd.clearSel();
    this.repaintMat(true);
    this.view.setObjects(st.objects);
    this.send({ t: 'objects', list: st.objects });
    this.stopProgram(true);
    this.placeRobot(st.start);
    this.view.clearTrail();
    if (resetScore) { this.missions.reset(); this.missions.match = null; }
    this.missions.render();
    if (this.mapEd) this.mapEd.render();
    this.saveSoon();
  }
  objectsChanged() {
    this.view.setObjects(this.state.objects);
    this.send({ t: 'objects', list: this.state.objects });
    this.missions.render();
    this.saveSoon();
  }
  resetField(silent) {
    this.stopProgram(true);
    this.send({ t: 'objects', list: this.state.objects });
    this.placeRobot(this.state.start);
    this.view.clearTrail();
    this.missions.reset();
    if (!silent) toast('Mesa reiniciada: peças e robô na posição inicial.', '', 1600);
  }
  placeRobot(p) { this.send({ t: 'pose', x: p.x, y: p.y, a: p.a }); }
  placeRobotHome(side) {
    const st = this.state;
    const inW = st.start.x < 1181;
    if ((side === 'W') === inW) this.placeRobot(st.start);
    else this.placeRobot({ x: 2362 - st.start.x, y: st.start.y, a: 180 - st.start.a });
  }
  setStartHere() {
    const r = this.frame && this.frame.robot; if (!r) return;
    this.state.start = { x: Math.round(r.x), y: Math.round(r.y), a: Math.round(r.a * 180 / Math.PI * 10) / 10 };
    this.saveSoon();
    toast(`Início definido em x=${this.state.start.x} y=${this.state.start.y} rumo ${this.state.start.a}°`, 'ok');
  }
  highlightMission(m) {
    if (!m) { this.view.showSelection(null); return; }
    let b = null;
    if (m.zone) b = { x0: m.zone.x - m.zone.w / 2, x1: m.zone.x + m.zone.w / 2, y0: m.zone.y - m.zone.h / 2, y1: m.zone.y + m.zone.h / 2, h: 20 };
    const id = m.obj || (m.objs && m.objs[0]);
    if (!b && id) {
      const o = this.frame && this.frame.objs.find(q => q.id === id);
      const d = this.state.objects.find(q => q.id === id);
      if (o && d) { const r = objRadius(d); const x = o.x ?? d.x, y = o.y ?? d.y; b = { x0: x - r, x1: x + r, y0: y - r, y1: y + r, h: (d.h || 50) + 10 }; }
    }
    this.view.showSelection(b);
  }

  // ------------------------------------------------------------ robô
  robotChanged(cfg) {
    const st = this.state;
    st.robot = cfg;
    this.view.buildRobot(cfg);
    const r = this.frame && this.frame.robot;
    this.send({ t: 'robot', cfg, pose: r ? { x: r.x, y: r.y, a: r.a * 180 / Math.PI } : st.start });
    this._bounds = null;
    this.saveSoon();
  }
  robotBounds() {
    if (!this._bounds || this._boundsCfg !== this.state.robot) { this._bounds = layoutRobot(this.state.robot).bounds; this._boundsCfg = this.state.robot; }
    return this._bounds;
  }
  hitRobot(p) {
    const r = this.frame && this.frame.robot; if (!r) return false;
    const B = this.robotBounds();
    const c = Math.cos(-r.a), s = Math.sin(-r.a);
    const dx = p.x - r.x, dy = p.y - r.y;
    const lx = c * dx - s * dy, ly = s * dx + c * dy;
    return lx >= B.minX - 10 && lx <= B.maxX + 10 && ly >= B.minY - 10 && ly <= B.maxY + 10;
  }
  hitObject(p) {
    const f = this.frame; if (!f) return null;
    let best = null, bd = 1e9;
    for (const d of this.state.objects) {
      const o = f.objs.find(q => q.id === d.id);
      const x = o && o.x !== undefined && !['alavanca', 'empurrador', 'botao', 'bandeira'].includes(d.type) ? o.x : d.x;
      const y = o && o.y !== undefined && !['alavanca', 'empurrador', 'botao', 'bandeira'].includes(d.type) ? o.y : d.y;
      const dist = Math.hypot(p.x - x, p.y - y);
      const rad = Math.min(objRadius(d), 90);
      if (dist < rad && dist < bd) { bd = dist; best = { d, x, y, a: o && o.a !== undefined ? o.a * 180 / Math.PI : (d.a || 0) }; }
    }
    return best;
  }

  // ------------------------------------------------------------ ponteiro
  onDown(p, e) {
    if (this.mapEd && this.mapEd.active && this.mapEd.wantsPointer()) return this.mapEd.down(p, e);
    const M = this.missions.match;
    if (this.hitRobot(p)) {
      const r = this.frame.robot;
      if (M && M.running) {
        const inside = robotCorners(r, this.robotBounds()).some(([x, y]) => inAnyHome(x, y));
        if (!inside) { this.missions.interrupt(); return false; }
      }
      if (this.running && !(M && M.running)) this.stopProgram(true);
      this.dragging = { kind: 'robot', off: [r.x - p.x, r.y - p.y], a: r.a * 180 / Math.PI, x: r.x, y: r.y };
      this.send({ t: 'grab', on: true });
      $('#vp').style.cursor = 'grabbing';
      return true;
    }
    const o = this.hitObject(p);
    if (o && !(M && M.running)) {
      this.dragging = { kind: 'obj', id: o.d.id, off: [o.x - p.x, o.y - p.y], a: o.a, x: o.x, y: o.y, d: o.d };
      if (this.mapEd) this.mapEd.selectObject(o.d.id);
      return true;
    }
    if (this.mapEd && this.mapEd.active) return this.mapEd.down(p, e);
    return false;
  }
  onMove(p, e) {
    const D = this.dragging;
    if (this.mapEd && this.mapEd.dragActive()) return this.mapEd.move(p, e);
    if (!D) return;
    D.x = p.x + D.off[0]; D.y = p.y + D.off[1];
    if (D.kind === 'robot') this.send({ t: 'pose', x: D.x, y: D.y, a: D.a });
    else this.send({ t: 'moveObj', id: D.id, x: D.x, y: D.y, a: D.a });
  }
  onUp(p, e) {
    const D = this.dragging;
    if (this.mapEd && this.mapEd.dragActive()) return this.mapEd.up(p, e);
    if (!D) return;
    this.dragging = null;
    $('#vp').style.cursor = '';
    if (D.kind === 'robot') { this.send({ t: 'pose', x: D.x, y: D.y, a: D.a }); this.send({ t: 'grab', on: false }); }
    else {
      const d = this.state.objects.find(q => q.id === D.id);
      if (d) { d.x = Math.round(D.x); d.y = Math.round(D.y); d.a = Math.round(D.a); }
      this.view.setObjects(this.state.objects);
      this.send({ t: 'moveObj', id: D.id, x: d.x, y: d.y, a: d.a });
      this.saveSoon();
      if (this.mapEd) this.mapEd.render();
    }
  }
  onHover(p, e) {
    if (this.mapEd && this.mapEd.active) this.mapEd.hover(p, e);
    const tip = $('#tip3d');
    if (!p || this.dragging) { tip.style.display = 'none'; return; }
    let txt = '';
    if (this.hitRobot(p)) txt = 'robô: arraste para mover · Q/E giram';
    else { const o = this.hitObject(p); if (o) txt = `${OBJ_TYPES[o.d.type].name} · arraste para mover`; }
    const cv = $('#view').getBoundingClientRect();
    if (txt) { tip.style.display = 'block'; tip.textContent = txt; tip.style.left = (e.clientX - cv.left + 14) + 'px'; tip.style.top = (e.clientY - cv.top + 12) + 'px'; $('#view').style.cursor = 'grab'; }
    else { tip.style.display = 'none'; $('#view').style.cursor = this.mapEd && this.mapEd.active && this.mapEd.wantsPointer() ? 'crosshair' : ''; }
  }
  hudDragInfo() {
    const D = this.dragging;
    $('#hudTool').innerHTML = `movendo o robô · x <span>${Math.round(D.x)}</span> y <span>${Math.round(D.y)}</span> · rumo <span>${Math.round(D.a)}°</span> · <span class="kbd">Q</span>/<span class="kbd">E</span> giram 5° (Shift: 45°)`;
  }

  onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape' && !typing) { if (this.running) this.stopProgram(); return; }
    if (typing) return;
    const D = this.dragging;
    if ((e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') && D) {
      const step = e.shiftKey ? 45 : 5;
      D.a += (e.key.toLowerCase() === 'q' ? step : -step);
      if (D.kind === 'robot') this.send({ t: 'pose', x: D.x, y: D.y, a: D.a });
      else this.send({ t: 'moveObj', id: D.id, x: D.x, y: D.y, a: D.a });
      e.preventDefault(); return;
    }
    if ((e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') && !D && this.frame && this.frame.robot && !this.running) {
      const r = this.frame.robot; const step = e.shiftKey ? 45 : 5;
      this.send({ t: 'pose', x: r.x, y: r.y, a: r.a * 180 / Math.PI + (e.key.toLowerCase() === 'q' ? step : -step) });
      return;
    }
    if (e.key === 'r' || e.key === 'R') { this.resetField(); return; }
    if (e.key === ' ' && !this.running) { e.preventDefault(); this.runCurrent(); return; }
    if (this.mapEd && this.mapEd.active) this.mapEd.key(e);
  }

  // ------------------------------------------------------------ menu
  async menu() {
    const st = this.state;
    const real = el('select', { class: 'in' }, el('option', { value: 0 }, 'Ideal (sem ruído nem imperfeições)'), el('option', { value: 0.5 }, 'Suave'), el('option', { value: 1 }, 'Realista (padrão)'), el('option', { value: 2 }, 'Desafiador'));
    real.value = String(st.settings.realism);
    const seed = el('input', { type: 'number', value: st.settings.seed });
    const batt = el('input', { type: 'range', min: 5, max: 100, value: Math.round(st.settings.battery * 100) });
    const snd = el('input', { type: 'checkbox', checked: st.settings.sound });
    const body = el('div', {},
      el('div', { class: 'fld2' }, el('label', {}, 'Realismo'), real),
      el('div', { class: 'fld2' }, el('label', {}, 'Semente do robô'), seed),
      el('p', { class: 'hint' }, 'Cada robô real é um pouco diferente: rodas com diâmetros levemente distintos, motores com forças diferentes, giroscópio com desvio. A semente escolhe essas diferenças; mude para testar se o programa funciona em "outro robô".'),
      el('div', { class: 'fld2' }, el('label', {}, 'Bateria inicial'), batt),
      el('div', { class: 'fld2' }, el('label', {}, 'Som do hub'), snd),
      el('hr', { style: { border: 0, borderTop: '1px solid #18222d', margin: '12px 0' } }),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => download('myfll-projeto.json', JSON.stringify(st, null, 1), 'application/json') }, '⤓ Exportar projeto'),
        el('button', { class: 'btn sm', onclick: async () => {
          const f = await pickFile('.json'); if (!f) return;
          try { const s = JSON.parse(f.text); if (s.v !== 1) throw new Error('versão'); store.set(SAVE_KEY, s); location.reload(); } catch (err) { toast('Arquivo inválido.', 'err'); }
        } }, '⤒ Abrir projeto'),
        el('button', { class: 'btn sm warn', onclick: async () => {
          const v = await modal('Recomeçar do zero', 'Apaga robô, mesa, missões e os 20 programas deste navegador.', [{ label: 'Cancelar', value: null }, { label: 'Apagar tudo', cls: 'bad', value: 'ok' }]);
          if (v === 'ok') { try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* */ } location.reload(); }
        } }, 'Recomeçar')),
      el('p', { class: 'hint', style: { marginTop: '12px' } }, 'MyFLL.lab é um projeto educacional independente, sem ligação com a LEGO ou a FIRST. A API segue a documentação pública do Python do hub SPIKE Prime e do Pybricks.'));
    const v = await modal('Projeto e configurações', body, [{ label: 'Fechar', value: null }, { label: 'Aplicar', cls: 'pri', value: 'ok' }]);
    if (v === 'ok') {
      const changed = +real.value !== st.settings.realism || +seed.value !== st.settings.seed;
      st.settings.realism = +real.value; st.settings.seed = +seed.value || 1; st.settings.battery = +batt.value / 100; st.settings.sound = snd.checked;
      this.saveSoon();
      if (changed) { this.pyState = 'loading'; this.onPy({ state: 'loading' }); this.spawnWorker(false); toast('Simulador reiniciado com as novas configurações.', 'ok'); }
      else this.send({ t: 'battery', soc: st.settings.battery });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
    setTimeout(() => { $('#boot').classList.add('gone'); }, 350);
  } catch (e) {
    console.error(e);
    $('#bootMsg').textContent = 'Erro ao iniciar: ' + e.message;
  }
});
export { validateRobot, PORTS, SPIKE_NAME, deepClone, TEMPLATES, HOME_W, HOME_E };
