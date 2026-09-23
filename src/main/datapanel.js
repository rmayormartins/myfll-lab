// ============================================================================
//  MyFLL.lab :: datapanel.js
//  Aba DADOS: telemetria ao vivo (motores, sensores, guinada), gráficos do
//  módulo app (linegraph, bargraph, display) e exportação CSV.
// ============================================================================
import { el, download, SPIKE_HEX } from './ui.js';

const L = ['A', 'B', 'C', 'D', 'E', 'F'];
const PAL = ['#37d5ff', '#ffb020', '#4dff91', '#ff4d6d', '#9d86ff', '#ff7a1a'];

export class DataPanel {
  constructor(root, app) {
    this.root = root; this.app = app;
    this.rec = [];            // { T, v: {sinal: valor} }
    this.sel = ['yaw', 'spd:A', 'spd:B'];
    this.lg = {}; this.bg = {}; this.lgShown = false; this.bgShown = false;
    this.disp = null;
    this.render();
  }
  render() {
    const r = this.root; r.innerHTML = '';
    this.sigBox = el('div', { class: 'ch' });
    this.cv = el('canvas', { height: 170 });
    r.appendChild(el('div', { class: 'chartbox' }, el('div', { class: 'ch' }, el('b', {}, 'TELEMETRIA'), el('span', { class: 'mute' }, 'últimos 10 s'), el('span', { style: { flex: 1 } }),
      el('button', { class: 'tg', onclick: () => { this.rec = []; } }, 'limpar'),
      el('button', { class: 'tg', onclick: () => this.csv() }, '⤓ CSV')), this.sigBox, this.cv));
    this.lgBox = el('div', { class: 'chartbox' }, el('div', { class: 'ch' }, el('b', {}, 'APP · LINEGRAPH'), el('span', { class: 'mute' }, 'from app import linegraph')));
    this.lgCv = el('canvas', { height: 170 });
    this.lgBox.appendChild(this.lgCv);
    this.bgBox = el('div', { class: 'chartbox' }, el('div', { class: 'ch' }, el('b', {}, 'APP · BARGRAPH')));
    this.bgCv = el('canvas', { height: 140 });
    this.bgBox.appendChild(this.bgCv);
    this.dispBox = el('div', { class: 'appdisp mute' }, 'app.display: texto e imagens do programa aparecem aqui');
    r.append(this.lgBox, this.bgBox, this.dispBox);
    r.appendChild(el('p', { class: 'hint', style: { margin: '8px 12px' } }, 'Dica: grave uma volta do seguidor de linha e exporte o CSV para analisar a reflexão numa planilha.'));
    this.buildSigs();
  }
  signals() {
    const f = this.app.frame; const out = [['yaw', 'guinada (°)'], ['v', 'velocidade (mm/s)'], ['x', 'x (mm)'], ['y', 'y (mm)']];
    if (f && f.ports) f.ports.forEach((p, i) => {
      if (!p) return;
      if (p.k === 'motor') { out.push(['spd:' + L[i], `motor ${L[i]} vel.`], ['rel:' + L[i], `motor ${L[i]} graus`], ['pwr:' + L[i], `motor ${L[i]} pot.`]); }
      if (p.k === 'color') out.push(['refl:' + L[i], `reflexão ${L[i]}`]);
      if (p.k === 'distance') out.push(['mm:' + L[i], `distância ${L[i]}`]);
      if (p.k === 'force') out.push(['n:' + L[i], `força ${L[i]}`]);
    });
    return out;
  }
  buildSigs() {
    const sigs = this.signals();
    this._sigKey = sigs.map(s => s[0]).join(',');
    this.sigBox.innerHTML = '';
    sigs.forEach(([k, name]) => {
      const on = this.sel.includes(k);
      const b = el('button', { class: 'tg' + (on ? ' on' : '') }, el('span', { class: 'sw', style: { background: on ? PAL[this.sel.indexOf(k) % PAL.length] : '#34475a' } }), name);
      b.onclick = () => { if (on) this.sel = this.sel.filter(s => s !== k); else { this.sel.push(k); if (this.sel.length > 5) this.sel.shift(); } this.buildSigs(); };
      this.sigBox.appendChild(b);
    });
  }
  values(f) {
    const v = {};
    if (f.robot) { v.x = f.robot.x; v.y = f.robot.y; v.v = Math.hypot(f.robot.vx, f.robot.vy) * 1000; }
    v.yaw = (f.hub.yaw || 0) / 10;
    (f.ports || []).forEach((p, i) => {
      if (!p) return;
      if (p.k === 'motor') { v['spd:' + L[i]] = p.spd; v['rel:' + L[i]] = p.rel; v['pwr:' + L[i]] = p.pwr / 100; }
      if (p.k === 'color') v['refl:' + L[i]] = p.refl;
      if (p.k === 'distance') v['mm:' + L[i]] = p.mm;
      if (p.k === 'force') v['n:' + L[i]] = p.n;
    });
    return v;
  }
  frame(f) {
    const last = this.rec[this.rec.length - 1];
    if (!last || f.T - last.T >= 0.045) { this.rec.push({ T: f.T, v: this.values(f) }); if (this.rec.length > 1400) this.rec.shift(); }
    if (last && f.T < last.T - 0.5) this.rec = [];
    const key = this.signals().map(s => s[0]).join(',');
    if (key !== this._sigKey) this.buildSigs();
    if (this.root.closest('.pane.on') && (!this._dt || performance.now() - this._dt > 60)) { this._dt = performance.now(); this.draw(); }
  }
  resize() { this.draw(); this.drawLg(); this.drawBg(); }
  prep(cv) {
    const w = cv.clientWidth || 400, h = cv.clientHeight || 170, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return [g, w, h];
  }
  axes(g, w, h, x0, x1, y0, y1, fx, fy) {
    g.strokeStyle = '#18222d'; g.lineWidth = 1; g.fillStyle = '#6b7d8f'; g.font = '10px JetBrains Mono, monospace';
    for (let k = 0; k <= 4; k++) {
      const y = 8 + (h - 24) * k / 4; g.beginPath(); g.moveTo(36, y); g.lineTo(w - 4, y); g.stroke();
      g.fillText(fy(y1 - (y1 - y0) * k / 4), 2, y + 3);
    }
    g.fillText(fx(x0), 36, h - 3); const t = fx(x1); g.fillText(t, w - 4 - g.measureText(t).width, h - 3);
  }
  draw() {
    const [g, w, h] = this.prep(this.cv);
    const rec = this.rec; if (rec.length < 2) return;
    const T1 = rec[rec.length - 1].T, T0 = T1 - 10;
    const pts = rec.filter(r => r.T >= T0);
    let lo = Infinity, hi = -Infinity;
    for (const k of this.sel) for (const r of pts) { const v = r.v[k]; if (v === undefined) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) return;
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    this.axes(g, w, h, T0, T1, lo, hi, (x) => x.toFixed(1) + 's', (y) => (Math.abs(y) >= 100 ? Math.round(y) : y.toFixed(1)));
    const X = (t) => 36 + (w - 40) * (t - T0) / 10, Y = (v) => 8 + (h - 24) * (1 - (v - lo) / (hi - lo));
    this.sel.forEach((k, i) => {
      g.strokeStyle = PAL[i % PAL.length]; g.lineWidth = 1.6; g.beginPath(); let started = false;
      for (const r of pts) { const v = r.v[k]; if (v === undefined) continue; if (!started) { g.moveTo(X(r.T), Y(v)); started = true; } else g.lineTo(X(r.T), Y(v)); }
      g.stroke();
    });
  }
  csv() {
    const keys = this.signals().map(s => s[0]);
    let s = 't_s,' + keys.join(',') + '\n';
    for (const r of this.rec) s += r.T.toFixed(3) + ',' + keys.map(k => r.v[k] ?? '').join(',') + '\n';
    download('telemetria-myfll.csv', s, 'text/csv');
  }
  // ------------------------------------------------------------ módulo app
  appEvent(a) {
    if (a.k === 'lg_plot') { (this.lg[a.c] = this.lg[a.c] || []).push([a.x, a.y]); if (this.lg[a.c].length > 4000) this.lg[a.c].shift(); this.lgShown = true; this.drawLgSoon(); }
    else if (a.k === 'lg_clear') { delete this.lg[a.c]; this.drawLgSoon(); }
    else if (a.k === 'lg_clear_all') { this.lg = {}; this.drawLgSoon(); }
    else if (a.k === 'lg_show') { this.lgShown = true; this.drawLgSoon(); this.showTab(); }
    else if (a.k === 'bg_set') { this.bg[a.c] = a.v; this.bgShown = true; this.drawBg(); }
    else if (a.k === 'bg_clear_all') { this.bg = {}; this.drawBg(); }
    else if (a.k === 'bg_show') { this.bgShown = true; this.drawBg(); this.showTab(); }
    else if (a.k === 'dp_text') { this.dispBox.className = 'appdisp'; this.dispBox.textContent = a.t; }
    else if (a.k === 'dp_image') { this.dispBox.className = 'appdisp'; this.dispBox.textContent = '🖼 imagem ' + a.i; }
    else if (a.k === 'dp_hide') { this.dispBox.className = 'appdisp mute'; this.dispBox.textContent = ''; }
    else if (a.k === 'dp_show') this.showTab();
  }
  showTab() { const b = document.querySelector('#right .tab[data-tab="data"]'); if (b && !b.classList.contains('on')) b.click(); }
  drawLgSoon() { if (this._lgT) return; this._lgT = setTimeout(() => { this._lgT = 0; this.drawLg(); }, 80); }
  drawLg() {
    const [g, w, h] = this.prep(this.lgCv);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c in this.lg) for (const [x, y] of this.lg[c]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!isFinite(x0)) { g.fillStyle = '#34475a'; g.font = '12px Chakra Petch, sans-serif'; g.fillText('sem dados: use linegraph.plot(color.RED, x, y)', 40, h / 2); return; }
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) { y1 += 1; y0 -= 1; }
    this.axes(g, w, h, x0, x1, y0, y1, (x) => String(Math.round(x * 10) / 10), (y) => String(Math.round(y * 10) / 10));
    const X = (x) => 36 + (w - 40) * (x - x0) / (x1 - x0), Y = (y) => 8 + (h - 24) * (1 - (y - y0) / (y1 - y0));
    for (const c in this.lg) {
      g.strokeStyle = SPIKE_HEX[c] === '#101010' ? '#d9e3ec' : (SPIKE_HEX[c] || '#37d5ff'); g.lineWidth = 1.6; g.beginPath();
      this.lg[c].forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke();
    }
  }
  drawBg() {
    const [g, w, h] = this.prep(this.bgCv);
    const ks = Object.keys(this.bg);
    if (!ks.length) { g.fillStyle = '#34475a'; g.font = '12px Chakra Petch, sans-serif'; g.fillText('sem dados: use bargraph.set_value(color.RED, 10)', 20, h / 2); return; }
    const mx = Math.max(1, ...ks.map(k => Math.abs(this.bg[k])));
    const bw = Math.min(60, (w - 40) / ks.length - 10);
    ks.forEach((k, i) => {
      const v = this.bg[k], bh = (h - 30) * Math.abs(v) / mx;
      const x = 30 + i * (bw + 10);
      g.fillStyle = SPIKE_HEX[k] === '#101010' ? '#d9e3ec' : (SPIKE_HEX[k] || '#37d5ff'); g.fillRect(x, h - 18 - bh, bw, bh);
      g.fillStyle = '#9fb0c0'; g.font = '10px JetBrains Mono, monospace'; g.fillText(String(Math.round(v * 10) / 10), x, h - 5);
    });
  }
}
