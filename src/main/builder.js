// ============================================================================
//  MyFLL.lab :: builder.js
//  Montador do robô: modelos prontos, vista de cima arrastável, chassi,
//  tração, rodízio, hub, sensores e acessórios com escolha de portas.
// ============================================================================
import { el, toast, download, pickFile, modal, fmt } from './ui.js';
import { ROBOT_PRESETS, WHEELS, MOTORS, SENSORS, CASTERS, PORTS, deepClone, validateRobot, layoutRobot } from '../common/catalog.js';

const COLORS = { chassis: '#2b3a48', wheel: '#15181b', motor: '#e8edf0', hub: '#f5c400', color: '#dfe5ea', distance: '#dfe5ea', force: '#dfe5ea', caster: '#9aa4ad', lift: '#e8407a', sweep: '#e8407a', beam: '#1f8f9e', ballast: '#6b7580' };

export class Builder {
  constructor(app, root) {
    this.app = app; this.root = root;
    this.cfg = deepClone(app.state.robot);
    this.sel = null;          // { list:'devices'|'attachments'|'hub'|'caster', i }
    this.applyT = 0;
    this.render();
  }

  apply(now) {
    clearTimeout(this.applyT);
    const go = () => {
      const v = validateRobot(this.cfg);
      this.drawInfo(v);
      if (v.errs.length) return;
      this.app.robotChanged(deepClone(this.cfg));
    };
    if (now) go(); else this.applyT = setTimeout(go, 220);
    this.draw();
  }

  render() {
    const root = this.root, cfg = this.cfg;
    root.innerHTML = '';
    // modelos
    const pres = el('div', { class: 'presets' });
    for (const [k, p] of Object.entries(ROBOT_PRESETS)) {
      pres.appendChild(el('button', { class: 'preset' + (cfg.name === p.name ? ' on' : ''), title: p.desc, onclick: () => { this.cfg = deepClone(p); this.sel = null; this.render(); this.apply(true); toast(`Robô "${p.name}" montado.`, 'ok', 1600); } }, el('b', {}, p.name), p.desc.split(':')[0].slice(0, 46)));
    }
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '01'), 'Modelos prontos'), pres));
    // vista de cima
    this.canvas = el('canvas', { class: 'bcanvas', title: 'Arraste sensores, hub, rodízio e acessórios' });
    this.info = el('div');
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '02'), 'Vista de cima', el('span', { class: 'aux' }, 'arraste as peças')), this.canvas,
      el('p', { class: 'hint' }, 'Arraste as peças para mudar a posição (grade de 4 mm = meio pino). O ponto amarelo é o centro de massa; ele precisa ficar dentro do triângulo das rodas com o rodízio.'), this.info));
    this.bindCanvas();
    requestAnimationFrame(() => this.draw());
    // chassi
    const ch = cfg.chassis;
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '03'), 'Chassi'),
      this.num('Frente (mm)', ch.front, 40, 180, 4, v => ch.front = v),
      this.num('Traseira (mm)', ch.back, 40, 200, 4, v => ch.back = v),
      this.num('Largura (mm)', ch.width, 64, 200, 8, v => ch.width = v),
      this.num('Altura do chão', ch.clearance, 4, 40, 1, v => ch.clearance = v),
      this.num('Espessura', ch.height, 16, 80, 4, v => ch.height = v)));
    // tração
    const dr = cfg.drive;
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '04'), 'Tração', el('span', { class: 'aux' }, 'motor_pair')),
      el('div', { class: 'fld2' }, el('label', {}, 'Rodas'), this.sel2(Object.entries(WHEELS).map(([k, w]) => [k, w.name]), dr.wheel, v => { dr.wheel = v; this.apply(); })),
      el('div', { class: 'fld2' }, el('label', {}, 'Motores'), this.sel2(Object.entries(MOTORS).map(([k, m]) => [k, m.name]), dr.motor, v => { dr.motor = v; this.apply(); })),
      this.num('Bitola (mm)', dr.track, 80, 220, 8, v => dr.track = v),
      this.num('Eixo x (mm)', dr.x || 0, -80, 80, 4, v => dr.x = v),
      el('div', { class: 'fld2' }, el('label', {}, 'Roda esquerda'), this.portSel(dr.left, v => dr.left = v)),
      el('div', { class: 'fld2' }, el('label', {}, 'Roda direita'), this.portSel(dr.right, v => dr.right = v)),
      el('p', { class: 'hint' }, 'Distância por volta da roda: ' + fmt(Math.PI * (WHEELS[dr.wheel] || WHEELS.spike56).d, 1) + ' mm (360 graus do motor).')));
    // rodízio e hub
    const cs = cfg.casters[0] || (cfg.casters[0] = { type: 'ball', x: -100, y: 0 });
    const hb = cfg.hub;
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '05'), 'Rodízio e hub'),
      el('div', { class: 'fld2' }, el('label', {}, 'Rodízio'), this.sel2(Object.entries(CASTERS).map(([k, c]) => [k, c.name]), cs.type, v => { cs.type = v; this.apply(); })),
      this.num('Rodízio x', cs.x, -220, 200, 4, v => cs.x = v),
      this.num('Hub x', hb.x, -160, 160, 4, v => hb.x = v),
      this.num('Hub altura', hb.z, 40, 200, 4, v => hb.z = v),
      el('div', { class: 'fld2' }, el('label', {}, 'Montagem'), this.sel2([['flat', 'Deitado (matriz para cima)'], ['upright', 'Em pé (matriz para trás)']], hb.mount || 'flat', v => { hb.mount = v; this.apply(); })),
      el('div', { class: 'fld2' }, el('label', {}, 'Giro do hub'), this.sel2([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], hb.rot || 0, v => { hb.rot = +v; this.apply(); })),
      el('p', { class: 'hint' }, 'Com o hub em pé use motion_sensor.set_yaw_face(motion_sensor.FRONT) para a guinada funcionar, como no robô real.')));
    // sensores
    const sens = el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '06'), 'Sensores'));
    cfg.devices.forEach((d, i) => sens.appendChild(this.devCard(d, i)));
    sens.appendChild(el('div', { class: 'row' },
      el('button', { class: 'btn sm', onclick: () => this.addDev('color') }, '+ cor'),
      el('button', { class: 'btn sm', onclick: () => this.addDev('distance') }, '+ distância'),
      el('button', { class: 'btn sm', onclick: () => this.addDev('force') }, '+ força')));
    root.appendChild(sens);
    // acessórios
    const acc = el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '07'), 'Acessórios'));
    cfg.attachments.forEach((a, i) => acc.appendChild(this.attCard(a, i)));
    acc.appendChild(el('div', { class: 'row' },
      el('button', { class: 'btn sm', onclick: () => this.addAtt('lift') }, '+ braço frontal'),
      el('button', { class: 'btn sm', onclick: () => this.addAtt('sweep') }, '+ braço lateral'),
      el('button', { class: 'btn sm', onclick: () => this.addAtt('collector') }, '+ coletor em U'),
      el('button', { class: 'btn sm', onclick: () => this.addAtt('plow') }, '+ empurrador'),
      el('button', { class: 'btn sm', onclick: () => this.addAtt('motor') }, '+ motor solto')));
    acc.appendChild(this.num('Lastro (g)', cfg.ballast || 0, 0, 400, 10, v => cfg.ballast = v));
    root.appendChild(acc);
    root.appendChild(el('div', { class: 'sec' }, el('div', { class: 'row' },
      el('button', { class: 'btn sm', onclick: () => download(`robo-${(cfg.name || 'meu').replace(/\W+/g, '-')}.json`, JSON.stringify(cfg, null, 1), 'application/json') }, '⤓ Exportar robô'),
      el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const c = JSON.parse(f.text); if (!c.drive || !c.chassis) throw 0; this.cfg = c; this.render(); this.apply(true); } catch (e) { toast('Arquivo de robô inválido.', 'err'); } } }, '⤒ Abrir robô'),
      el('button', { class: 'btn sm', onclick: async () => { const i = el('input', { type: 'text', value: cfg.name || '' }); const v = await modal('Nome do robô', i, [{ label: 'Cancelar', value: null }, { label: 'Salvar', cls: 'pri', value: 'ok' }]); if (v === 'ok') { cfg.name = i.value; this.apply(true); } } }, '✎ Nome'))));
    this.drawInfo(validateRobot(cfg));
    this.draw();
  }

  // ------------------------------------------------------------ campos
  num(label, value, min, max, step, set) {
    const out = el('output', {}, String(value));
    const inp = el('input', { type: 'range', min, max, step, value });
    inp.addEventListener('input', () => { out.textContent = inp.value; set(+inp.value); this.apply(); });
    return el('div', { class: 'fld' }, el('label', {}, label), inp, out);
  }
  sel2(opts, value, on) {
    const s = el('select', { class: 'in' }, ...opts.map(([v, t]) => el('option', { value: v, selected: String(v) === String(value) }, t)));
    s.addEventListener('change', () => on(s.value));
    return s;
  }
  usedPorts() {
    const c = this.cfg, u = {};
    [c.drive.left, c.drive.right].forEach(p => p && (u[p] = 1));
    c.devices.forEach(d => d.port && (u[d.port] = (u[d.port] || 0) + 1));
    c.attachments.forEach(a => a.port && (u[a.port] = (u[a.port] || 0) + 1));
    return u;
  }
  portSel(value, set) {
    const box = el('div', { class: 'portsel' });
    const used = this.usedPorts();
    for (const p of PORTS) {
      const b = el('button', { class: (p === value ? 'on' : '') + (used[p] && p !== value ? ' used' : ''), title: used[p] && p !== value ? 'Porta em uso: trocar libera a outra' : 'Porta ' + p }, p);
      b.onclick = () => { this.swapPort(value, p); set(p); this.render(); this.apply(); };
      box.appendChild(b);
    }
    return box;
  }
  // se a porta nova estiver ocupada, a peça que estava nela recebe a porta antiga
  swapPort(oldP, newP) {
    const c = this.cfg;
    if (!oldP || oldP === newP) return;
    if (c.drive.left === newP) c.drive.left = oldP;
    else if (c.drive.right === newP) c.drive.right = oldP;
    for (const d of c.devices) if (d.port === newP) d.port = oldP;
    for (const a of c.attachments) if (a.port === newP) a.port = oldP;
  }
  freePort() { const u = this.usedPorts(); return PORTS.find(p => !u[p]) || null; }

  devCard(d, i) {
    const s = SENSORS[d.kind];
    const card = el('div', { class: 'part' });
    card.appendChild(el('div', { class: 'ph' }, s.name, el('span', { class: 'pl' }, d.port || '?'),
      el('button', { class: 'x', title: 'Remover', onclick: () => { this.cfg.devices.splice(i, 1); this.render(); this.apply(); } }, '×')));
    card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Porta'), this.portSel(d.port, v => d.port = v)));
    card.appendChild(this.num('x (frente)', d.x, -160, 200, 4, v => d.x = v));
    card.appendChild(this.num('y (esquerda)', d.y, -120, 120, 4, v => d.y = v));
    if (d.kind === 'color') card.appendChild(this.num('Altura do tapete', d.z, 2, 64, 1, v => d.z = v));
    else {
      card.appendChild(this.num('Altura (mm)', d.z, 12, 200, 2, v => d.z = v));
      card.appendChild(this.num('Direção (°)', d.dir || 0, -180, 180, 15, v => d.dir = v));
    }
    return card;
  }
  attCard(a, i) {
    const names = { lift: 'Braço frontal (sobe e desce)', sweep: 'Braço lateral (gira na horizontal)', collector: 'Coletor em U (passivo)', plow: 'Empurrador frontal (passivo)', motor: 'Motor solto' };
    const card = el('div', { class: 'part' });
    card.appendChild(el('div', { class: 'ph' }, names[a.kind] || a.kind, a.port ? el('span', { class: 'pl' }, a.port) : null,
      el('button', { class: 'x', title: 'Remover', onclick: () => { this.cfg.attachments.splice(i, 1); this.render(); this.apply(); } }, '×')));
    if (a.port !== undefined) {
      card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Porta'), this.portSel(a.port, v => a.port = v)));
      card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Motor'), this.sel2([['medium', 'Médio'], ['large', 'Grande'], ['small', 'Pequeno']], a.motor || 'medium', v => { a.motor = v; this.apply(); })));
    }
    if (a.kind === 'lift') {
      card.appendChild(this.num('Pivô x', a.x, -60, 160, 4, v => a.x = v));
      card.appendChild(this.num('Pivô altura', a.z, 30, 220, 4, v => a.z = v));
      card.appendChild(this.num('Comprimento', a.length, 60, 260, 8, v => a.length = v));
      card.appendChild(this.num('Largura', a.width, 16, 160, 8, v => a.width = v));
      card.appendChild(this.num('Limite baixo (°)', a.min, -90, 0, 5, v => a.min = v));
      card.appendChild(this.num('Limite alto (°)', a.max, 0, 120, 5, v => a.max = v));
      card.appendChild(this.num('Ângulo inicial', a.start, -90, 120, 5, v => a.start = v));
      card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Engrenagem'), this.sel2([[1, '1:1 direto'], [3, '1:3 (mais força)'], [5, '1:5 (muita força)'], [0.333, '3:1 (mais rápido)']], a.gear || 1, v => { a.gear = +v; this.apply(); })));
      card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Sentido'), this.sel2([[1, 'motor + sobe'], [-1, 'motor + desce']], a.dir || 1, v => { a.dir = +v; this.apply(); })));
    } else if (a.kind === 'sweep') {
      card.appendChild(this.num('Pivô x', a.x, -140, 160, 4, v => a.x = v));
      card.appendChild(this.num('Pivô y', a.y, -120, 120, 4, v => a.y = v));
      card.appendChild(this.num('Altura', a.z, 16, 160, 2, v => a.z = v));
      card.appendChild(this.num('Comprimento', a.length, 40, 220, 8, v => a.length = v));
      card.appendChild(this.num('Ângulo inicial', a.start || 0, -180, 180, 15, v => a.start = v));
      card.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Engrenagem'), this.sel2([[1, '1:1 direto'], [3, '1:3 (mais força)'], [0.333, '3:1 (mais rápido)']], a.gear || 1, v => { a.gear = +v; this.apply(); })));
    } else if (a.kind === 'collector' || a.kind === 'plow') {
      card.appendChild(this.num('Início x', a.x, 0, 200, 4, v => a.x = v));
      card.appendChild(this.num('Largura', a.width, 40, 260, 8, v => a.width = v));
      if (a.kind === 'collector') card.appendChild(this.num('Profundidade', a.depth, 24, 160, 8, v => a.depth = v));
      card.appendChild(this.num('Altura máx.', a.z1, 12, 80, 2, v => a.z1 = v));
    } else if (a.kind === 'motor') {
      card.appendChild(this.num('x', a.x, -140, 160, 4, v => a.x = v));
      card.appendChild(this.num('y', a.y, -100, 100, 4, v => a.y = v));
    }
    return card;
  }
  addDev(kind) {
    const port = this.freePort();
    if (!port) { toast('Todas as 6 portas estão ocupadas. Remova algo primeiro.', 'warn'); return; }
    const c = this.cfg;
    const d = kind === 'color' ? { kind, port, x: c.chassis.front - 10, y: 0, z: 12 } : kind === 'distance' ? { kind, port, x: c.chassis.front + 8, y: 0, z: 60, dir: 0 } : { kind, port, x: c.chassis.front + 8, y: 30, z: 30, dir: 0 };
    c.devices.push(d); this.render(); this.apply();
  }
  addAtt(kind) {
    const c = this.cfg;
    let a;
    if (kind === 'lift' || kind === 'sweep' || kind === 'motor') {
      const port = this.freePort();
      if (!port) { toast('Todas as 6 portas estão ocupadas.', 'warn'); return; }
      if (kind === 'lift') a = { kind, port, motor: 'medium', x: Math.max(20, c.chassis.front - 40), y: 0, z: 100, length: 140, width: 48, gear: 1, dir: 1, min: -40, max: 80, start: 70 };
      else if (kind === 'sweep') a = { kind, port, motor: 'medium', x: -20, y: c.chassis.width / 2 + 6, z: 46, length: 130, gear: 1, dir: 1, start: 0 };
      else a = { kind, port, motor: 'medium', x: -40, y: 0, z: 70 };
    } else if (kind === 'collector') a = { kind, x: c.chassis.front, width: 150, depth: 80, z0: 6, z1: 34 };
    else a = { kind, x: c.chassis.front, width: 140, z0: 6, z1: 30 };
    c.attachments.push(a); this.render(); this.apply();
  }

  drawInfo(v) {
    if (!this.info) return;
    const L = layoutRobot(this.cfg);
    const box = el('div');
    box.appendChild(el('div', { class: 'kv' },
      el('span', {}, 'massa'), el('span', {}, Math.round(L.mass * 1000) + ' g'),
      el('span', {}, 'centro de massa'), el('span', {}, `x ${fmt(L.com[0], 0)} · y ${fmt(L.com[1], 0)} · z ${fmt(L.com[2], 0)} mm`),
      el('span', {}, 'tamanho'), el('span', {}, `${Math.round(L.bounds.maxX - L.bounds.minX)} x ${Math.round(L.bounds.maxY - L.bounds.minY)} x ${Math.round(L.bounds.maxZ)} mm`)));
    for (const e of v.errs) box.appendChild(el('div', { class: 'note err' }, e));
    for (const w of v.warns) box.appendChild(el('div', { class: 'note' }, w));
    this.info.innerHTML = ''; this.info.appendChild(box);
  }

  // ------------------------------------------------------------ vista de cima
  view() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(200, c.clientWidth || 276), ch = Math.max(160, c.clientHeight || 260);
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const W = c.width, H = c.height;
    const L = layoutRobot(this.cfg);
    const B = L.bounds;
    const spanX = B.maxX - B.minX + 50, spanY = B.maxY - B.minY + 50;
    const s = Math.min(W / spanX, H / spanY);
    const cx = W / 2 - ((B.maxX + B.minX) / 2) * s, cy = H / 2 + ((B.maxY + B.minY) / 2) * s;
    return { s, cx, cy, L, dpr };
  }
  toPx(v, x, y) { return [v.cx + x * v.s, v.cy - y * v.s]; }
  toMm(v, px, py) { return [(px - v.cx) / v.s, (v.cy - py) / v.s]; }
  draw() {
    const c = this.canvas; if (!c) return;
    const g = c.getContext('2d');
    const v = this.view(), { L } = v, k = v.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#070b10'; g.fillRect(0, 0, c.width, c.height);
    // grade de pinos (8 mm)
    g.strokeStyle = 'rgba(55,213,255,.06)'; g.lineWidth = 1;
    for (let x = -400; x <= 400; x += 8) { const [px] = this.toPx(v, x, 0); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, c.height); g.stroke(); }
    for (let y = -400; y <= 400; y += 8) { const [, py] = this.toPx(v, 0, y); g.beginPath(); g.moveTo(0, py); g.lineTo(c.width, py); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.14)';
    const [ox, oy] = this.toPx(v, 0, 0);
    g.beginPath(); g.moveTo(0, oy); g.lineTo(c.width, oy); g.moveTo(ox, 0); g.lineTo(ox, c.height); g.stroke();
    const order = ['chassis', 'beam', 'wheel', 'motor', 'caster', 'hub', 'ballast', 'lift', 'sweep', 'color', 'distance', 'force'];
    const parts = L.parts.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const labels = [];
    for (const p of parts) {
      let w = p.w, d = p.d, x = p.x, y = p.y, rot = (p.rot || 0) * Math.PI / 180;
      if (p.kind === 'lift') { const a = p.att; const reach = a.length * Math.cos((a.start ?? 60) * Math.PI / 180); w = Math.max(8, Math.abs(reach)); d = a.width; x = a.x + reach / 2; y = a.y; }
      if (p.kind === 'sweep') { const a = p.att; w = a.length; d = 12; rot = (a.start || 0) * Math.PI / 180; x = a.x + Math.cos(rot) * a.length / 2; y = a.y + Math.sin(rot) * a.length / 2; }
      const [px, py] = this.toPx(v, x, y);
      g.save(); g.translate(px, py); g.rotate(-rot);
      const isSel = this.sel && this.selPart(p);
      const rw = w * v.s, rd = d * v.s;
      if (p.kind === 'lift') {
        g.fillStyle = 'rgba(232,64,122,.28)'; g.fillRect(-rw / 2, -rd / 2, rw, rd);
        g.setLineDash([4 * k, 3 * k]); g.strokeStyle = isSel ? '#37d5ff' : '#e8407a'; g.lineWidth = 1.5 * k; g.strokeRect(-rw / 2, -rd / 2, rw, rd); g.setLineDash([]);
      } else {
        g.fillStyle = COLORS[p.kind] || '#888';
        g.globalAlpha = p.kind === 'chassis' ? 0.95 : 1;
        g.fillRect(-rw / 2, -rd / 2, rw, rd);
        g.globalAlpha = 1;
        g.strokeStyle = isSel ? '#37d5ff' : 'rgba(0,0,0,.5)'; g.lineWidth = (isSel ? 2.5 : 1) * k;
        g.strokeRect(-rw / 2, -rd / 2, rw, rd);
      }
      if (p.kind === 'color') { g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, Math.max(2.5 * k, 5 * v.s), 0, 7); g.fill(); }
      if (p.kind === 'distance') { g.fillStyle = '#111'; for (const q of [-1, 1]) { g.beginPath(); g.arc(rw / 2, q * 13 * v.s, 8 * v.s, 0, 7); g.fill(); } }
      if (p.kind === 'force') { g.fillStyle = '#111'; g.fillRect(rw / 2, -6 * v.s, 8 * v.s, 12 * v.s); }
      if (p.kind === 'hub') {
        g.fillStyle = '#15191d'; g.fillRect(-14 * v.s + 10 * v.s, -14 * v.s, 28 * v.s, 28 * v.s);
        g.fillStyle = '#e4e4de'; g.beginPath(); g.arc(-22 * v.s, 0, 7 * v.s, 0, 7); g.fill();
      }
      g.restore();
      if (p.port && p.kind !== 'motor') {
        const lx = p.kind === 'lift' ? p.att.x : (p.kind === 'sweep' ? p.att.x : p.x), ly = p.kind === 'lift' ? p.att.y : (p.kind === 'sweep' ? p.att.y : p.y);
        const [qx, qy] = this.toPx(v, lx, ly);
        labels.push([p.port, qx, p.kind === 'wheel' ? qy + (p.side > 0 ? -1 : 1) * (d * v.s / 2 + 9 * k) : qy - 12 * k]);
      }
    }
    // triângulo de apoio e centro de massa
    const cfg = this.cfg;
    const sup = [[cfg.drive.x || 0, cfg.drive.track / 2], ...cfg.casters.map(q => [q.x, q.y || 0]), [cfg.drive.x || 0, -cfg.drive.track / 2]];
    g.strokeStyle = 'rgba(255,207,51,.55)'; g.setLineDash([4 * k, 4 * k]); g.lineWidth = 1 * k; g.beginPath();
    sup.forEach(([x, y], i) => { const [px, py] = this.toPx(v, x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.closePath(); g.stroke(); g.setLineDash([]);
    const [mx, my] = this.toPx(v, L.com[0], L.com[1]);
    g.fillStyle = '#ffcf33'; g.beginPath(); g.arc(mx, my, 5 * k, 0, 7); g.fill();
    g.strokeStyle = '#05080c'; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(mx - 5 * k, my); g.lineTo(mx + 5 * k, my); g.moveTo(mx, my - 5 * k); g.lineTo(mx, my + 5 * k); g.stroke();
    // rótulos das portas
    g.font = `700 ${10 * k}px JetBrains Mono, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, x, y] of labels) {
      g.fillStyle = '#05080c'; g.beginPath(); g.arc(x, y, 7 * k, 0, 7); g.fill();
      g.strokeStyle = '#ffcf33'; g.lineWidth = 1.2 * k; g.stroke();
      g.fillStyle = '#ffcf33'; g.fillText(t, x, y + 0.5 * k);
    }
    // frente
    g.fillStyle = 'rgba(159,176,192,.8)'; g.font = `${10 * k}px Chakra Petch, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillText('FRENTE →', c.width - 6 * k, 14 * k);
  }
  selPart(p) {
    const s = this.sel; const c = this.cfg;
    if (s.list === 'hub') return p.kind === 'hub';
    if (s.list === 'caster') return p.kind === 'caster';
    if (s.list === 'devices') return p.dev === c.devices[s.i];
    if (s.list === 'attachments') return p.att === c.attachments[s.i] && p.kind !== 'motor';
    return false;
  }
  pick(mm) {
    const c = this.cfg;
    const near = (x, y, r) => Math.hypot(mm[0] - x, mm[1] - y) <= r;
    for (let i = c.devices.length - 1; i >= 0; i--) { const d = c.devices[i]; if (near(d.x, d.y, 16)) return { list: 'devices', i, get: () => [d.x, d.y], set: (x, y) => { d.x = x; d.y = y; } }; }
    for (let i = c.attachments.length - 1; i >= 0; i--) {
      const a = c.attachments[i];
      const ax = a.kind === 'collector' || a.kind === 'plow' ? a.x + (a.depth || 8) / 2 : a.x, ay = a.y || 0;
      if (near(ax, ay, 22)) return { list: 'attachments', i, get: () => [a.x, a.y || 0], set: (x, y) => { a.x = x; if (a.y !== undefined && a.kind !== 'lift') a.y = y; } };
    }
    if (near(c.hub.x, c.hub.y || 0, 30)) return { list: 'hub', get: () => [c.hub.x, 0], set: (x) => { c.hub.x = x; } };
    const cs = c.casters[0];
    if (cs && near(cs.x, cs.y || 0, 16)) return { list: 'caster', get: () => [cs.x, 0], set: (x) => { cs.x = x; } };
    return null;
  }
  bindCanvas() {
    const c = this.canvas;
    let drag = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', (e) => {
      const v = this.view(); const [px, py] = pos(e); const mm = this.toMm(v, px, py);
      const h = this.pick(mm);
      this.sel = h; this.draw();
      if (h) { const [x0, y0] = h.get(); drag = { h, v, off: [x0 - mm[0], y0 - mm[1]] }; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; }
    });
    c.addEventListener('pointermove', (e) => {
      const [px, py] = pos(e);
      if (!drag) { const v = this.view(); c.style.cursor = this.pick(this.toMm(v, px, py)) ? 'grab' : 'default'; return; }
      const mm = this.toMm(drag.v, px, py);
      const snap = (q) => Math.round(q / 4) * 4;
      drag.h.set(snap(mm[0] + drag.off[0]), snap(mm[1] + drag.off[1]));
      this.draw();
    });
    const up = () => { if (!drag) return; drag = null; c.style.cursor = 'default'; this.render(); this.apply(true); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
}
