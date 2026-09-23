// ============================================================================
//  MyFLL.lab :: hubpanel.js
//  Hub virtual: matriz 5x5, botões (esquerda, centro, direita), luz do botão
//  central e painel das portas A a F com as leituras ao vivo.
// ============================================================================
import { el, lightHex, SPIKE_HEX, SPIKE_NAME, fmt } from './ui.js';
import { MOTORS, SENSORS } from '../common/catalog.js';

const L = ['A', 'B', 'C', 'D', 'E', 'F'];

export class HubPanel {
  constructor(root, cb) {
    this.cb = cb;   // { button(name, down), force(port, n), tap() }
    this.root = root;
    root.innerHTML = '';
    this.leds = [];
    const mx = el('div', { class: 'hubmx', title: 'Matriz de luz 5x5' });
    for (let i = 0; i < 25; i++) { const d = el('i'); this.leds.push(d); mx.appendChild(d); }
    const btn = (cls, name, label, title) => {
      const b = el('button', { class: 'hbtn ' + cls, title, 'aria-label': title }, label);
      const down = (e) => { e.preventDefault(); b.classList.add('down'); cb.button(name, true); };
      const up = () => { if (!b.classList.contains('down')) return; b.classList.remove('down'); cb.button(name, false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      return b;
    };
    this.bC = btn('c', 'center', '', 'Botão central: inicia ou para o programa');
    const bL = btn('l', 'left', '◀', 'Botão esquerdo');
    const bR = btn('r', 'right', '▶', 'Botão direito');
    this.bt = el('div', { class: 'hubbt', title: 'Luz do Bluetooth (light.CONNECT)' });
    const ports = el('div', { class: 'hubports' },
      el('span', { style: { left: '2px', top: '38px' } }, 'A'), el('span', { style: { left: '2px', top: '96px' } }, 'C'), el('span', { style: { left: '2px', top: '150px' } }, 'E'),
      el('span', { style: { right: '2px', top: '38px' } }, 'B'), el('span', { style: { right: '2px', top: '96px' } }, 'D'), el('span', { style: { right: '2px', top: '150px' } }, 'F'));
    this.dev = el('div', { class: 'hubdev' }, el('div', { class: 'hubface' }, mx, el('div', { class: 'hubbtns' }, bL, this.bC, bR), this.bt), ports);
    this.cards = L.map((p, i) => el('div', { class: 'pcard empty' }, el('span', { class: 'pl' }, p), el('div', { class: 'pn' }, 'vazia')));
    this.slotInfo = el('span', {}, '0');
    this.info = el('div', { class: 'hubrow' });
    const tapBtn = el('button', { class: 'tg', title: 'Simula uma batida no hub (gesto TAPPED)', onclick: () => cb.tap() }, 'bater no hub');
    this.hubinfo = el('div', { class: 'hubinfo' }, el('div', { class: 'portgrid' }, this.cards), this.info, el('div', { class: 'hubrow' }, tapBtn, el('span', { class: 'mute' }, 'programa'), el('b', {}, this.slotInfo), el('span', { class: 'mute' }, '◀ ▶ trocam, centro executa')));
    root.appendChild(this.dev);
    root.appendChild(this.hubinfo);
    this.lastKinds = '';
    this.forceDown = {};
  }

  update(f) {
    if (!f.hub) return;
    const M = f.hub.matrix;
    for (let i = 0; i < 25; i++) {
      const v = M[i] / 100;
      this.leds[i].style.background = v > 0.02 ? `rgba(255,255,255,${0.2 + 0.8 * v})` : '#262c31';
      this.leds[i].style.boxShadow = v > 0.3 ? `0 0 ${4 * v}px rgba(255,255,255,${0.6 * v})` : 'none';
    }
    this.bC.style.setProperty('--led', lightHex(f.hub.power));
    this.bt.style.setProperty('--led2', lightHex(f.hub.connect));
    this.dev.classList.toggle('off', !!f.off);
    this.slotInfo.textContent = String(f.slot ?? 0);
    const kinds = (f.ports || []).map(p => p ? p.k + (p.type || '') : '-').join(',');
    if (kinds !== this.lastKinds) { this.lastKinds = kinds; this._rebuildCards(f.ports || []); }
    (f.ports || []).forEach((p, i) => this._fill(i, p));
    this.info.innerHTML = `<span>yaw</span><b>${fmt((f.hub.yaw || 0) / 10, 1)}°</b><span>bateria</span><b>${f.hub.batt}%</b><span>${fmt(f.hub.V || 0, 2)} V</span>`;
  }

  _rebuildCards(ports) {
    ports.forEach((p, i) => {
      const c = this.cards[i];
      c.innerHTML = '';
      c.appendChild(el('span', { class: 'pl' }, L[i]));
      if (!p) { c.className = 'pcard empty'; c.appendChild(el('div', { class: 'pn' }, 'vazia')); return; }
      c.className = 'pcard';
      const name = p.k === 'motor' ? 'Motor ' + ({ large: 'grande', medium: 'médio', small: 'pequeno' }[p.type] || '') : ({ color: 'Cor', distance: 'Distância', force: 'Força' }[p.k] || p.k);
      c.appendChild(el('div', { class: 'pn' }, name));
      c.appendChild(el('div', { class: 'pv' }));
      if (p.k === 'force') {
        const b = el('button', { class: 'press', title: 'Segure para pressionar o sensor de força' }, 'apertar');
        const down = (e) => { e.preventDefault(); this.cb.force(i, 6); b.style.color = '#4dff91'; };
        const up = () => { this.cb.force(i, 0); b.style.color = ''; };
        b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
        c.appendChild(b);
      }
    });
  }

  _fill(i, p) {
    if (!p) return;
    const v = this.cards[i].querySelector('.pv'); if (!v) return;
    if (p.k === 'motor') v.innerHTML = `rel <b>${p.rel}°</b><br>abs <b>${p.abs}°</b><br><b>${p.spd}</b>°/s <b>${Math.round(p.pwr / 100)}</b>%${p.st ? '<br><span style="color:#ff4d6d">travado</span>' : ''}`;
    else if (p.k === 'color') v.innerHTML = `<span class="sw" style="background:${p.color >= 0 ? SPIKE_HEX[p.color] : 'transparent'}"></span><b>${SPIKE_NAME[p.color] ?? p.color}</b><br>cor <b>${p.color}</b><br>reflexão <b>${p.refl}</b>`;
    else if (p.k === 'distance') v.innerHTML = `<b style="font-size:14px">${p.mm < 0 ? '-1' : p.mm}</b> mm<br>${p.mm < 0 ? '<span class="mute">nada à vista</span>' : ''}`;
    else if (p.k === 'force') v.innerHTML = `<b style="font-size:14px">${fmt(p.n, 1)}</b> N<br>${p.pressed ? '<b style="color:#4dff91">pressionado</b>' : 'solto'}`;
  }
}
