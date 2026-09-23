// ============================================================================
//  MyFLL.lab :: mapeditor.js
//  Aba MESA: tapetes prontos, gerador de mapa, ferramentas de desenho (linha,
//  zona, círculo, pincel, texto, base, borracha), modelos de missão e
//  exportação do tapete (JSON e PNG em escala para imprimir).
// ============================================================================
import { el, toast, download, pickFile, modal, uid, fmt } from './ui.js';
import { TEMPLATES, generateMap, homeItems } from './mapgen.js';
import { hitItem, itemBounds, moveItem, segDist, makeMatCanvas, paintMat } from './matpaint.js';
import { OBJ_TYPES, objDefaults, objRadius, MAT } from '../common/objects.js';

const TOOLS = [
  ['select', 'Selecionar', '<path d="M5 3l12 8-6 1 3 6-2 1-3-6-4 4z" fill="currentColor"/>'],
  ['line', 'Linha', '<path d="M3 17C7 6 12 16 17 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'],
  ['rect', 'Zona', '<rect x="3" y="5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>'],
  ['circle', 'Círculo', '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>'],
  ['brush', 'Pincel', '<path d="M3 16c3 0 4-2 4-4l7-8 2 2-8 7c-2 0-4 1-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'],
  ['text', 'Texto', '<path d="M4 5h12M10 5v11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
  ['object', 'Objeto', '<path d="M4 7l6-3 6 3v7l-6 3-6-3z M4 7l6 3 6-3 M10 10v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'],
  ['erase', 'Borracha', '<path d="M4 13l7-8 5 5-6 6H7z M9 16h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'],
];
const SWATCHES = ['#111111', '#ffffff', '#e02d2d', '#22b14c', '#1e5bff', '#f5c400', '#ff8a1a', '#8a2be2', '#ff2bd6', '#27b5ff', '#27e0c8', '#8c8c8c'];

export class MapEditor {
  constructor(app, root) {
    this.app = app; this.root = root;
    this.active = false;
    this.tool = 'select';
    this.color = '#111111';
    this.width = 20;
    this.fill = true;
    this.objType = 'caixa';
    this.sel = null;         // { kind:'item', i } | { kind:'obj', id }
    this.drag = null;
    this.draft = null;
    this.hist = []; this.fut = [];
    this.render();
  }

  setActive(on) {
    this.active = on;
    if (!on) { this.app.view.setCursor(null); this.app.view.setPreview(null); }
    this.hint();
  }
  wantsPointer() { return this.tool !== 'select'; }
  dragActive() { return !!(this.drag || this.draft); }
  selItem() { return this.sel && this.sel.kind === 'item' ? this.app.state.map.items[this.sel.i] : null; }
  clearSel() { this.sel = null; }
  selectObject(id) { this.sel = { kind: 'obj', id }; if (this.active) this.renderProps(); }

  snapshot() { this.hist.push(JSON.stringify({ map: this.app.state.map, objects: this.app.state.objects })); if (this.hist.length > 60) this.hist.shift(); this.fut = []; }
  undo() {
    const s = this.hist.pop(); if (!s) { toast('Nada para desfazer.', '', 1200); return; }
    this.fut.push(JSON.stringify({ map: this.app.state.map, objects: this.app.state.objects }));
    const o = JSON.parse(s); this.restore(o);
  }
  redo() {
    const s = this.fut.pop(); if (!s) return;
    this.hist.push(JSON.stringify({ map: this.app.state.map, objects: this.app.state.objects }));
    this.restore(JSON.parse(s));
  }
  restore(o) {
    const st = this.app.state;
    const objChanged = JSON.stringify(st.objects) !== JSON.stringify(o.objects);
    st.map = o.map; st.objects = o.objects; this.sel = null;
    this.app.repaintMat(true);
    if (objChanged) this.app.objectsChanged();
    this.app.saveSoon(); this.render();
  }
  changed(obj) {
    this.app.repaintMat(true);
    if (obj) this.app.objectsChanged();
    this.app.saveSoon();
  }

  hint() {
    const h = document.getElementById('hudTool'); if (!h) return;
    if (!this.active) { h.innerHTML = 'arraste o robô para posicionar · <span class="kbd">Q</span>/<span class="kbd">E</span> giram · <span class="kbd">R</span> reinicia a mesa'; return; }
    const t = {
      select: 'clique para selecionar desenhos · arraste para mover · <span class="kbd">Del</span> apaga · <span class="kbd">Ctrl+Z</span> desfaz',
      line: 'clique para pôr pontos da linha · duplo clique ou <span class="kbd">Enter</span> termina · <span class="kbd">Esc</span> cancela',
      rect: 'arraste para desenhar uma zona retangular', circle: 'arraste do centro para fora', brush: 'arraste para pintar à mão livre',
      text: 'clique onde o texto deve ficar', object: 'clique para colocar o modelo · <span class="kbd">Q</span>/<span class="kbd">E</span> giram o selecionado', erase: 'clique num desenho ou modelo para apagar',
    }[this.tool];
    h.innerHTML = t;
  }

  // ------------------------------------------------------------ ponteiro
  down(p, e) {
    const st = this.app.state;
    const P = [Math.round(p.x), Math.round(p.y)];
    if (this.tool === 'select') {
      const i = this.hitIndex(p);
      if (i < 0) { if (this.sel) { this.sel = null; this.app.repaintMat(false); this.renderProps(); } return false; }
      this.snapshot();
      this.sel = { kind: 'item', i };
      this.drag = { last: P, moved: false };
      this.app.repaintMat(false); this.renderProps();
      return true;
    }
    if (this.tool === 'erase') {
      const o = this.app.hitObject(p);
      if (o) { this.snapshot(); st.objects = st.objects.filter(q => q.id !== o.d.id); st.missions = st.missions.filter(m => m.obj !== o.d.id && !(m.objs && m.objs.includes(o.d.id))); this.changed(true); return true; }
      const i = this.hitIndex(p);
      if (i >= 0) { this.snapshot(); st.map.items.splice(i, 1); this.sel = null; this.changed(false); }
      return true;
    }
    if (this.tool === 'object') {
      this.snapshot();
      const d = Object.assign(objDefaults(this.objType), { id: uid('o'), x: P[0], y: P[1], a: 0 });
      if (this.color && this.color !== '#111111' && this.color !== '#ffffff' && d.color) d.color = this.color;
      st.objects.push(d);
      this.sel = { kind: 'obj', id: d.id };
      this.changed(true); this.renderProps();
      return true;
    }
    if (this.tool === 'text') {
      this.snapshot();
      const input = el('input', { type: 'text', value: 'MISSÃO' });
      modal('Texto no tapete', input, [{ label: 'Cancelar', value: null }, { label: 'Colocar', cls: 'pri', value: 'ok' }]).then(v => {
        if (v !== 'ok' || !input.value.trim()) return;
        st.map.items.push({ t: 'text', x: P[0], y: P[1], text: input.value.slice(0, 40), size: 44, color: this.color });
        this.sel = { kind: 'item', i: st.map.items.length - 1 }; this.changed(false); this.renderProps();
      });
      setTimeout(() => input.focus(), 50);
      return true;
    }
    if (this.tool === 'line') {
      if (!this.draft) { this.snapshot(); this.draft = { t: 'line', pts: [P, P.slice()] }; }
      else this.draft.pts.push(P.slice());
      this.preview();
      return true;
    }
    if (this.tool === 'brush') { this.snapshot(); this.draft = { t: 'path', pts: [P] }; this.preview(); return true; }
    if (this.tool === 'rect' || this.tool === 'circle') { this.snapshot(); this.draft = { t: this.tool, a: P, b: P }; this.preview(); return true; }
    return false;
  }
  move(p) {
    const P = [Math.round(p.x), Math.round(p.y)];
    if (this.drag && this.sel && this.sel.kind === 'item') {
      const it = this.app.state.map.items[this.sel.i];
      moveItem(it, P[0] - this.drag.last[0], P[1] - this.drag.last[1]);
      this.drag.last = P; this.drag.moved = true;
      this.app.repaintMat(false);
      return;
    }
    const d = this.draft; if (!d) return;
    if (d.t === 'line') d.pts[d.pts.length - 1] = P;
    else if (d.t === 'path') { const l = d.pts[d.pts.length - 1]; if (Math.hypot(l[0] - P[0], l[1] - P[1]) > 6) d.pts.push(P); }
    else d.b = P;
    this.preview();
  }
  up(p) {
    if (this.drag) { const moved = this.drag.moved; this.drag = null; if (moved) { this.changed(false); } else this.hist.pop(); this.renderProps(); return; }
    const d = this.draft; if (!d) return;
    if (d.t === 'line') return;       // continua até duplo clique / Enter
    this.draft = null;
    const st = this.app.state;
    if (d.t === 'path') { if (d.pts.length > 1) st.map.items.push({ t: 'path', pts: simplify(d.pts, 3), w: this.width, color: this.color }); }
    else if (d.t === 'rect') {
      const w = Math.abs(d.b[0] - d.a[0]), h = Math.abs(d.b[1] - d.a[1]);
      if (w > 10 && h > 10) st.map.items.push({ t: 'rect', x: (d.a[0] + d.b[0]) / 2, y: (d.a[1] + d.b[1]) / 2, w, h, fill: this.fill ? this.color : 'none', stroke: this.fill ? null : this.color, sw: 8 });
    } else if (d.t === 'circle') {
      const r = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      if (r > 6) st.map.items.push({ t: 'circle', x: d.a[0], y: d.a[1], r: Math.round(r), fill: this.fill ? this.color : 'none', stroke: this.fill ? null : this.color, sw: 8 });
    }
    this.app.view.setPreview(null);
    this.sel = { kind: 'item', i: st.map.items.length - 1 };
    this.changed(false); this.renderProps();
  }
  dbl() { if (this.draft && this.draft.t === 'line') this.finishLine(); }
  finishLine() {
    const d = this.draft; this.draft = null; this.app.view.setPreview(null);
    if (!d) return;
    const pts = d.pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 4);
    if (pts.length >= 2) {
      this.app.state.map.items.push({ t: 'line', pts, w: this.width, color: this.color, smooth: this.smooth !== false && pts.length > 2 });
      this.sel = { kind: 'item', i: this.app.state.map.items.length - 1 };
      this.changed(false); this.renderProps();
    }
  }
  hover(p) {
    if (!this.active || !p) { this.app.view.setCursor(null); return; }
    if (this.tool === 'select' || this.tool === 'erase') { this.app.view.setCursor(null); return; }
    const r = this.tool === 'object' ? objRadius(objDefaults(this.objType)) : Math.max(8, this.width / 2);
    this.app.view.setCursor(p, this.color === '#ffffff' ? '#37d5ff' : this.color, r);
  }
  key(e) {
    const st = this.app.state;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.redo(); return; }
    if (e.key === 'Enter' && this.draft && this.draft.t === 'line') { e.preventDefault(); this.draft.pts.pop(); this.finishLine(); return; }
    if (e.key === 'Escape' && this.draft) { this.draft = null; this.app.view.setPreview(null); this.hist.pop(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) {
      e.preventDefault(); this.snapshot();
      if (this.sel.kind === 'item') { st.map.items.splice(this.sel.i, 1); this.sel = null; this.changed(false); }
      else { const id = this.sel.id; st.objects = st.objects.filter(q => q.id !== id); st.missions = st.missions.filter(m => m.obj !== id && !(m.objs && m.objs.includes(id))); this.sel = null; this.changed(true); }
      this.renderProps(); return;
    }
    if ((e.key === 'q' || e.key === 'e' || e.key === 'Q' || e.key === 'E') && this.sel) {
      const step = (e.shiftKey ? 45 : 15) * (e.key.toLowerCase() === 'q' ? 1 : -1);
      if (this.sel.kind === 'obj') { const d = st.objects.find(q => q.id === this.sel.id); if (d) { d.a = ((d.a || 0) + step + 360) % 360; this.changed(true); } }
      else { const it = st.map.items[this.sel.i]; if (it && (it.t === 'rect' || it.t === 'text' || it.t === 'home')) { it.a = ((it.a || 0) + step + 360) % 360; this.changed(false); } }
      this.renderProps();
    }
    const tk = { v: 'select', l: 'line', z: 'rect', c: 'circle', b: 'brush', t: 'text', o: 'object', x: 'erase' }[e.key];
    if (tk && !e.ctrlKey && !e.metaKey) this.setTool(tk);
  }
  hitIndex(p) {
    const items = this.app.state.map.items;
    for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], p.x, p.y)) return i;
    return -1;
  }
  preview() {
    const d = this.draft; if (!d) return;
    const col = this.color === '#ffffff' ? '#37d5ff' : this.color;
    if (d.t === 'line' || d.t === 'path') this.app.view.setPreview({ kind: 'poly', pts: d.pts, color: col });
    else if (d.t === 'rect') this.app.view.setPreview({ kind: 'poly', closed: true, color: col, pts: [[d.a[0], d.a[1]], [d.b[0], d.a[1]], [d.b[0], d.b[1]], [d.a[0], d.b[1]]] });
    else if (d.t === 'circle') {
      const r = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]); const pts = [];
      for (let k = 0; k < 40; k++) pts.push([d.a[0] + Math.cos(k / 40 * 6.283) * r, d.a[1] + Math.sin(k / 40 * 6.283) * r]);
      this.app.view.setPreview({ kind: 'poly', closed: true, color: col, pts });
    }
  }

  setTool(t) {
    if (this.draft) { if (this.draft.t === 'line') this.finishLine(); this.draft = null; }
    this.tool = t;
    if (t === 'select' || t === 'erase') this.app.view.setCursor(null);
    this.root.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    if (this.objRow) this.objRow.style.display = t === 'object' ? '' : 'none';
    if (t !== 'select' && t !== 'object' && this.app.view.mode === 'orbit') { this.app.view.setMode('top'); document.querySelectorAll('#hudTR .toggles')[0].querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === 'Topo')); }
    this.hint();
  }

  // ------------------------------------------------------------ painel
  render() {
    const root = this.root, st = this.app.state;
    root.innerHTML = '';
    // tapetes prontos e gerador
    const tsel = el('select', { class: 'in' }, ...Object.entries(TEMPLATES).map(([k, t]) => el('option', { value: k }, t.name)));
    const seed = el('input', { type: 'number', value: Math.floor(Math.random() * 90000 + 1000), style: { width: '90px' } });
    tsel.style.flex = '1'; seed.style.flex = '1';
    root.appendChild(el('div', { class: 'sec' },
      el('h2', {}, el('span', { class: 'n' }, '01'), 'Tapete', el('span', { class: 'aux' }, st.map.name || '')),
      el('div', { class: 'fld2' }, el('label', {}, 'Modelo'), el('div', { class: 'row nw' }, tsel, el('button', { class: 'btn pri sm', onclick: async () => {
        const v = await modal('Trocar o tapete', `Carregar "${TEMPLATES[tsel.value].name}"? O desenho atual e as missões serão substituídos.`, [{ label: 'Cancelar', value: null }, { label: 'Carregar', cls: 'pri', value: 'ok' }]);
        if (v !== 'ok') return; this.snapshot(); this.app.loadField(TEMPLATES[tsel.value].make(), true); toast('Tapete carregado.', 'ok');
      } }, 'Usar'))),
      el('div', { class: 'fld2' }, el('label', {}, 'Gerar mapa'), el('div', { class: 'row nw' }, seed,
        el('button', { class: 'btn xs', title: 'Sortear', onclick: () => { seed.value = Math.floor(Math.random() * 90000 + 1000); } }, '🎲'),
        el('button', { class: 'btn sm', onclick: () => { this.snapshot(); const r = generateMap(+seed.value || 1); this.app.loadField(r, true); toast(`Mapa de linhas gerado (semente ${seed.value}). Adicione missões na aba MISSÕES.`, 'ok', 3200); } }, 'Gerar'))),
      el('div', { class: 'fld2' }, el('label', {}, 'Cor de fundo'), el('div', { class: 'row' },
        el('input', { type: 'color', value: toHex(st.map.bg || '#f3f1ea'), oninput: (e) => { st.map.bg = e.target.value; this.app.repaintMat(false); }, onchange: () => this.changed(false) }),
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); st.map.items = st.map.items.filter(i => i.t === 'home'); this.sel = null; this.changed(false); } }, 'limpar desenhos'),
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); if (!st.map.items.some(i => i.t === 'grid')) st.map.items.unshift({ t: 'grid', step: 100, color: 'rgba(0,0,0,.14)', labels: true }); else st.map.items = st.map.items.filter(i => i.t !== 'grid'); this.changed(false); } }, 'grade 10 cm'))),
      el('p', { class: 'hint' }, 'Tapete de 2362 x 1143 mm, na mesa com bordas de 76 mm como na FLL. BASE azul e rosa são as áreas de lançamento.')));
    // ferramentas
    const tools = el('div', { class: 'tools' });
    for (const [k, name, svg] of TOOLS) {
      const b = el('button', { class: 'tool' + (this.tool === k ? ' on' : ''), 'data-t': k, title: name, html: `<svg viewBox="0 0 20 20">${svg}</svg>` });
      b.appendChild(el('span', {}, name));
      b.onclick = () => this.setTool(k);
      tools.appendChild(b);
    }
    const sw = el('div', { class: 'swatches' });
    for (const c of SWATCHES) {
      const s = el('button', { class: 'swatch' + (c === this.color ? ' on' : ''), style: { background: c }, title: c });
      s.onclick = () => { this.color = c; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === s)); this.applyColorToSel(c); };
      sw.appendChild(s);
    }
    sw.appendChild(el('input', { type: 'color', value: this.color, title: 'outra cor', oninput: (e) => { this.color = e.target.value; this.applyColorToSel(this.color); } }));
    const wout = el('output', {}, this.width + ' mm');
    const wid = el('input', { type: 'range', min: 4, max: 80, step: 1, value: this.width, oninput: (e) => { this.width = +e.target.value; wout.textContent = this.width + ' mm'; } });
    const fillT = el('div', { class: 'seg' }, el('button', { class: this.fill ? 'on' : '', onclick: (e) => { this.fill = true; e.target.parentElement.children[0].classList.add('on'); e.target.parentElement.children[1].classList.remove('on'); } }, 'cheio'),
      el('button', { class: this.fill ? '' : 'on', onclick: (e) => { this.fill = false; e.target.parentElement.children[1].classList.add('on'); e.target.parentElement.children[0].classList.remove('on'); } }, 'contorno'));
    const pal = el('div', { class: 'objpal' });
    for (const [k, t] of Object.entries(OBJ_TYPES)) {
      const b = el('button', { class: 'objbtn' + (k === this.objType ? ' on' : ''), title: t.desc }, el('i', { style: { background: t.color } }), t.name);
      b.onclick = () => { this.objType = k; pal.querySelectorAll('.objbtn').forEach(x => x.classList.toggle('on', x === b)); this.setTool('object'); };
      pal.appendChild(b);
    }
    this.objRow = el('div', {}, el('p', { class: 'hint' }, 'Modelos de missão com física: clique na mesa para colocar.'), pal);
    this.objRow.style.display = this.tool === 'object' ? '' : 'none';
    root.appendChild(el('div', { class: 'sec' },
      el('h2', {}, el('span', { class: 'n' }, '02'), 'Desenhar', el('span', { class: 'aux' }, 'Ctrl+Z desfaz')),
      tools,
      el('div', { style: { height: '8px' } }), sw,
      el('div', { class: 'fld' }, el('label', {}, 'Espessura'), wid, wout),
      el('div', { class: 'fld2' }, el('label', {}, 'Zonas'), fillT),
      this.objRow,
      el('p', { class: 'hint' }, 'Linhas pretas de 20 mm são o padrão para seguir linha. O sensor de cor lê exatamente o que está pintado aqui.')));
    // propriedades
    this.props = el('div', { class: 'sec' });
    root.appendChild(this.props);
    this.renderProps();
    // exportar
    root.appendChild(el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '04'), 'Arquivos'),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => download(`mesa-${slug(st.map.name)}.json`, JSON.stringify({ map: st.map, objects: st.objects, missions: st.missions, start: st.start }, null, 1), 'application/json') }, '⤓ Mesa (JSON)'),
        el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(f.text); if (!o.map) throw 0; this.snapshot(); if (o.start) st.start = o.start; this.app.loadField(o, true); toast('Mesa carregada.', 'ok'); } catch (e) { toast('Arquivo de mesa inválido.', 'err'); } } }, '⤒ Abrir mesa'),
        el('button', { class: 'btn sm', title: 'Imagem 1 px = 1 mm (imprima em escala para uma mesa real)', onclick: () => this.exportPng() }, '⤓ Imagem PNG'))));
  }

  applyColorToSel(c) {
    const st = this.app.state;
    if (!this.sel || this.tool !== 'select') return;
    this.snapshot();
    if (this.sel.kind === 'item') {
      const it = st.map.items[this.sel.i]; if (!it) return;
      if (it.t === 'line' || it.t === 'path' || it.t === 'text') it.color = c;
      else if (it.t === 'rect' || it.t === 'circle') { if (it.fill && it.fill !== 'none') it.fill = c; else it.stroke = c; }
      else if (it.t === 'home') it.color = c;
      this.changed(false);
    } else {
      const d = st.objects.find(q => q.id === this.sel.id); if (d) { d.color = c; this.changed(true); }
    }
  }

  renderProps() {
    const P = this.props; if (!P) return;
    const st = this.app.state;
    P.innerHTML = '';
    P.appendChild(el('h2', {}, el('span', { class: 'n' }, '03'), 'Selecionado'));
    if (!this.sel) { P.appendChild(el('p', { class: 'hint' }, 'Nada selecionado. Use a ferramenta Selecionar (tecla V) ou clique num modelo.')); return; }
    const num = (label, obj, key, min, max, step, isObj) => {
      const out = el('output', {}, fmt(obj[key] ?? 0, 0));
      const inp = el('input', { type: 'range', min, max, step, value: obj[key] ?? 0 });
      inp.addEventListener('input', () => { obj[key] = +inp.value; out.textContent = inp.value; if (isObj) { this.app.view.setObjects(st.objects); } else this.app.repaintMat(false); });
      inp.addEventListener('change', () => this.changed(!!isObj));
      inp.addEventListener('pointerdown', () => this.snapshot());
      return el('div', { class: 'fld' }, el('label', {}, label), inp, out);
    };
    if (this.sel.kind === 'item') {
      const it = st.map.items[this.sel.i]; if (!it) { this.sel = null; return this.renderProps(); }
      const names = { line: 'Linha', path: 'Traço livre', rect: 'Zona retangular', circle: 'Círculo', text: 'Texto', home: 'Área de lançamento (BASE)', grid: 'Grade' };
      P.appendChild(el('div', { class: 'row' }, el('b', {}, names[it.t] || it.t), el('span', { class: 'mute mono' }, it.x !== undefined ? `(${Math.round(it.x)}, ${Math.round(it.y)})` : '')));
      if (it.t === 'line' || it.t === 'path') {
        P.appendChild(num('Espessura', it, 'w', 2, 100, 1));
        if (it.t === 'line') { const cb = el('input', { type: 'checkbox', checked: !!it.smooth, onchange: (e) => { it.smooth = e.target.checked; this.changed(false); } }); P.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Curva suave'), cb)); }
      }
      if (it.t === 'rect' || it.t === 'home') { P.appendChild(num('Largura', it, 'w', 10, 2362, 2)); P.appendChild(num('Altura', it, 'h', 10, 1143, 2)); P.appendChild(num('Rotação', it, 'a', -180, 180, 5)); }
      if (it.t === 'circle') P.appendChild(num('Raio', it, 'r', 5, 600, 1));
      if (it.t === 'text') { P.appendChild(num('Tamanho', it, 'size', 10, 200, 2)); P.appendChild(num('Rotação', it, 'a', -180, 180, 5)); const ti = el('input', { type: 'text', value: it.text, oninput: (e) => { it.text = e.target.value; this.app.repaintMat(false); }, onchange: () => this.changed(false) }); P.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Texto'), ti)); }
      if (it.t === 'rect' || it.t === 'circle' || it.t === 'home') { const lb = el('input', { type: 'text', value: it.label || '', placeholder: 'rótulo', oninput: (e) => { it.label = e.target.value; this.app.repaintMat(false); }, onchange: () => this.changed(false) }); P.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Rótulo'), lb)); }
      P.appendChild(el('div', { class: 'row' },
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); const x = st.map.items.splice(this.sel.i, 1)[0]; st.map.items.push(x); this.sel.i = st.map.items.length - 1; this.changed(false); } }, 'trazer para frente'),
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); const x = st.map.items.splice(this.sel.i, 1)[0]; st.map.items.unshift(x); this.sel.i = 0; this.changed(false); } }, 'mandar para trás'),
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); const c = JSON.parse(JSON.stringify(it)); moveItem(c, 40, -40); st.map.items.push(c); this.sel.i = st.map.items.length - 1; this.changed(false); this.renderProps(); } }, 'duplicar'),
        el('button', { class: 'btn xs bad', onclick: () => { this.snapshot(); st.map.items.splice(this.sel.i, 1); this.sel = null; this.changed(false); this.renderProps(); } }, 'apagar')));
    } else {
      const d = st.objects.find(q => q.id === this.sel.id); if (!d) { this.sel = null; return this.renderProps(); }
      const t = OBJ_TYPES[d.type];
      P.appendChild(el('div', { class: 'row' }, el('b', {}, t.name), el('span', { class: 'mute mono' }, `${d.id} · (${Math.round(d.x)}, ${Math.round(d.y)})`)));
      P.appendChild(el('p', { class: 'hint' }, t.desc));
      P.appendChild(num('Rotação', d, 'a', 0, 360, 5, true));
      for (const [k, lab, mn, mx, stp] of [['w', 'Largura', 16, 400, 2], ['d', 'Profundidade', 16, 200, 2], ['h', 'Altura', 8, 240, 2], ['r', 'Raio', 8, 120, 1], ['len', 'Comprimento', 60, 260, 5], ['travel', 'Curso', 30, 200, 5], ['mass', 'Massa (g)', 5, 500, 5], ['handle', 'Altura da alça', 50, 140, 2], ['force', 'Força (N)', 0.2, 5, 0.1]]) {
        if (d[k] !== undefined) P.appendChild(num(lab, d, k, mn, mx, stp, true));
      }
      if (d.dir !== undefined) P.appendChild(el('div', { class: 'fld2' }, el('label', {}, 'Gira para'), el('div', { class: 'seg' },
        el('button', { class: d.dir > 0 ? 'on' : '', onclick: () => { this.snapshot(); d.dir = 1; this.changed(true); this.renderProps(); } }, 'anti-horário'),
        el('button', { class: d.dir < 0 ? 'on' : '', onclick: () => { this.snapshot(); d.dir = -1; this.changed(true); this.renderProps(); } }, 'horário'))));
      P.appendChild(el('div', { class: 'row' },
        el('button', { class: 'btn xs', onclick: () => { this.snapshot(); const c = Object.assign({}, d, { id: uid('o'), x: d.x + 80, y: d.y }); st.objects.push(c); this.sel = { kind: 'obj', id: c.id }; this.changed(true); this.renderProps(); } }, 'duplicar'),
        el('button', { class: 'btn xs bad', onclick: () => { this.snapshot(); st.objects = st.objects.filter(q => q.id !== d.id); st.missions = st.missions.filter(m => m.obj !== d.id && !(m.objs && m.objs.includes(d.id))); this.sel = null; this.changed(true); this.renderProps(); } }, 'apagar')));
    }
  }

  exportPng() {
    const c = makeMatCanvas();
    paintMat(c, this.app.state.map, {});
    c.toBlob((b) => {
      const a = el('a', { href: URL.createObjectURL(b), download: `tapete-${slug(this.app.state.map.name)}.png` });
      document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
    });
    toast('Imagem do tapete gerada (2362 x 1143 px, 1 px = 1 mm).', 'ok');
  }
}

function slug(s) { return String(s || 'mesa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function toHex(c) { if (/^#[0-9a-f]{6}$/i.test(c)) return c; return '#f3f1ea'; }
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (segDist(pts[i][0], pts[i][1], keep[keep.length - 1], pts[i + 1]) > tol) keep.push(pts[i]);
  keep.push(pts[pts.length - 1]);
  return keep;
}
export { homeItems, itemBounds, MAT };
