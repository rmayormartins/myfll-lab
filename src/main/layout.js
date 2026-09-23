// ============================================================================
//  MyFLL.lab :: layout.js
//  Bordas arrastáveis entre os painéis. Cada divisória (.rz) muda uma variável
//  CSS; os tamanhos ficam salvos no navegador. Duplo clique restaura o padrão,
//  setas do teclado ajustam de 16 em 16 px (Shift: 64).
// ============================================================================
import { $, $$, store } from './ui.js';

const KEY = 'myfll.layout';
// limites fixos [mínimo, máximo] em px
const LIM = { lw: [250, 680], rw: [320, 1200], dh: [110, 1200], hw: [330, 1400], wh: [460, 4000] };
const CENTER_MIN = 360;   // largura mínima da vista 3D
const CENTER_FIT = 556;   // largura que cabe hub (330) + console (220)
const VIEW_MIN = 160;     // altura mínima da vista 3D
const CONSOLE_MIN = 220;  // largura mínima do console
const GUT = 6;            // espessura da divisória

export class Layout {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.v = store.get(KEY, {}) || {};
    this.root = document.documentElement;
    this.work = $('#work');
    this.mq = window.matchMedia('(max-width:1100px)');
    for (const g of $$('.rz')) this.bind(g);
    this.apply();
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.apply()); });
  }

  // tamanho atual (medido na tela) de cada dimensão
  measure(k) {
    if (k === 'lw') return $('#left').offsetWidth;
    if (k === 'rw') return $('#right').offsetWidth;
    if (k === 'dh') return $('.dock').offsetHeight;
    if (k === 'hw') return $('#hubpanel').offsetWidth;
    if (k === 'wh') return this.work.offsetHeight;
    return 0;
  }

  // limites que dependem das outras dimensões e do tamanho da janela
  bounds(k) {
    const [lo, hi] = LIM[k];
    const W = this.root.clientWidth;
    let max = hi;
    if (k === 'lw') max = Math.min(hi, W - this.measure('rw') - CENTER_MIN - 2 * GUT);
    else if (k === 'rw') max = Math.min(hi, W - this.measure('lw') - CENTER_MIN - 2 * GUT);
    else if (k === 'dh') max = Math.min(hi, this.work.clientHeight - VIEW_MIN - GUT);
    else if (k === 'hw') max = Math.min(hi, $('.center').clientWidth - CONSOLE_MIN - GUT);
    return [lo, Math.max(lo, max)];
  }

  set(k, px, save) {
    const [lo, hi] = this.bounds(k);
    const v = Math.round(Math.min(hi, Math.max(lo, px)));
    this.root.style.setProperty('--' + k, v + 'px');
    if (save) { this.v[k] = v; this.save(); }
    return v;
  }

  reset(k) {
    delete this.v[k];
    this.root.style.removeProperty('--' + k);
    this.save();
    this.apply();
  }

  resetAll() {
    this.v = {};
    for (const k of Object.keys(LIM)) this.root.style.removeProperty('--' + k);
    this.save();
    this.apply();
  }

  save() { store.set(KEY, this.v); }

  // reaplica os tamanhos salvos, respeitando a janela atual (sem apagar a preferência)
  apply() {
    if (this.mq.matches) { this.onChange(); return; }   // no celular os painéis ficam empilhados
    for (const k of ['wh', 'lw', 'rw', 'dh', 'hw']) {
      if (this.v[k] != null) this.set(k, this.v[k], false);
      else this.root.style.removeProperty('--' + k);
    }
    // se não couber na janela, aperta o painel da direita e depois o da esquerda:
    // tamanhos padrão cedem até sobrar espaço para hub + console; os escolhidos
    // pelo usuário só cedem para manter a vista 3D com o mínimo
    const W = this.root.clientWidth;
    const squeeze = (k, minCenter) => {
      const over = this.measure('lw') + this.measure('rw') + minCenter + 2 * GUT - W;
      if (over > 0) this.root.style.setProperty('--' + k, Math.max(LIM[k][0], this.measure(k) - over) + 'px');
    };
    for (const k of ['rw', 'lw']) if (this.v[k] == null) squeeze(k, CENTER_FIT);
    for (const k of ['rw', 'lw']) squeeze(k, CENTER_MIN);
    this.fit();
    this.onChange();
  }

  // mantém o console e a vista 3D com tamanho mínimo quando outra borda se move
  // volta ao tamanho preferido (salvo ou padrão) sempre que houver espaço
  fit(k) {
    for (const j of ['hw', 'dh']) {
      if (j === k) continue;
      if (this.v[j] != null) { this.set(j, this.v[j], false); continue; }
      this.root.style.removeProperty('--' + j);
      const hi = this.bounds(j)[1];
      if (this.measure(j) > hi) this.set(j, hi, false);
    }
  }

  bind(g) {
    const k = g.dataset.k, dir = +g.dataset.dir || 1, horiz = g.classList.contains('h');
    let start = null, raf = 0, last = 0;
    const flush = () => { raf = 0; this.set(k, last, false); this.fit(k); this.onChange(); };
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.mq.matches) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      start = { p: horiz ? e.clientY : e.clientX, s: this.measure(k) };
      g.classList.add('drag');
      document.body.classList.add(horiz ? 'rz-row' : 'rz-col');
    });
    g.addEventListener('pointermove', (e) => {
      if (!start) return;
      last = start.s + dir * ((horiz ? e.clientY : e.clientX) - start.p);
      if (!raf) raf = requestAnimationFrame(flush);
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (raf) { cancelAnimationFrame(raf); flush(); }
      this.v[k] = this.measure(k); this.save();
      g.classList.remove('drag');
      document.body.classList.remove('rz-row', 'rz-col');
      this.onChange();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('lostpointercapture', end);
    g.addEventListener('dblclick', () => this.reset(k));
    g.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 64 : 16;
      const grow = horiz ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
      if (e.key in grow) {
        this.set(k, this.measure(k) + dir * grow[e.key] * step, true);
        this.fit(k);
        this.onChange();
        e.preventDefault(); e.stopPropagation();
      } else if (e.key === 'Enter' || e.key === 'Home') { this.reset(k); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === ' ') e.stopPropagation();
    });
  }
}
