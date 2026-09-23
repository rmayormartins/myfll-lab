// ============================================================================
//  MyFLL.lab :: editor.js
//  Editor de Python leve: realce de sintaxe, indentação automática, comentar
//  linhas, autocompletar da API do hub e marcação da linha com erro.
// ============================================================================
import { el } from './ui.js';

const KW = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const BI = new Set('print range len int float str bool list dict tuple set abs min max round sum sorted enumerate zip map filter isinstance type any all divmod pow hex bin chr ord repr iter next reversed super object'.split(' '));
const MODS = new Set(['hub', 'motor', 'motor_pair', 'color_sensor', 'distance_sensor', 'force_sensor', 'color', 'device', 'runloop', 'orientation', 'app',
  'port', 'light_matrix', 'motion_sensor', 'button', 'sound', 'light', 'time', 'math', 'random', 'pybricks', 'PrimeHub', 'Motor', 'DriveBase',
  'ColorSensor', 'UltrasonicSensor', 'ForceSensor', 'Port', 'Direction', 'Stop', 'Color', 'Button', 'Axis', 'Side', 'Icon', 'StopWatch', 'wait', 'multitask', 'run_task', 'hub_menu']);

function escH(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function highlight(src) {
  let out = '', i = 0;
  const n = src.length;
  let prevWord = '';
  while (i < n) {
    const c = src[i];
    if (c === '#') {
      let j = src.indexOf('\n', i); if (j < 0) j = n;
      out += '<span class="tk-c">' + escH(src.slice(i, j)) + '</span>'; i = j; continue;
    }
    if (c === '"' || c === "'") {
      const triple = src.substr(i, 3) === c.repeat(3);
      let j = i + (triple ? 3 : 1);
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (triple ? src.substr(j, 3) === c.repeat(3) : src[j] === c) { j += triple ? 3 : 1; break; }
        if (!triple && src[j] === '\n') break;
        j++;
      }
      // prefixo f/r/b já foi emitido como palavra
      out += '<span class="tk-s">' + escH(src.slice(i, j)) + '</span>'; i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1; while (j < n && /[0-9a-fA-FxXoObB_.eE]/.test(src[j])) j++;
      out += '<span class="tk-n">' + escH(src.slice(i, j)) + '</span>'; i = j; continue;
    }
    if (/[A-Za-z_À-ſ]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9_À-ſ]/.test(src[j])) j++;
      const w = src.slice(i, j);
      let cls = '';
      if (KW.has(w)) cls = 'tk-k';
      else if (prevWord === 'def' || prevWord === 'class') cls = 'tk-f';
      else if (BI.has(w)) cls = 'tk-b';
      else if (MODS.has(w)) cls = 'tk-m';
      else if (/^[A-Z][A-Z0-9_]+$/.test(w) && w.length > 1) cls = 'tk-a';
      out += cls ? `<span class="${cls}">${w}</span>` : w;
      prevWord = w; i = j; continue;
    }
    if (c === '@') {
      let j = i + 1; while (j < n && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out += '<span class="tk-d">' + escH(src.slice(i, j)) + '</span>'; i = j; continue;
    }
    if (c !== ' ' && c !== '\t' && c !== '\n') prevWord = '';
    out += escH(c); i++;
  }
  return out + '\n';
}

export class Editor {
  constructor(root, opts = {}) {
    this.opts = opts;       // { onChange, onRun, onSave, complete(prefix, ctx) }
    this.gut = el('div', { class: 'ed-gutter' });
    this.hl = el('pre', { class: 'ed-hl', 'aria-hidden': 'true' });
    this.ta = el('textarea', { class: 'ed-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': 'Editor de código Python' });
    this.errMark = el('div', { class: 'ed-errline', style: { display: 'none' } });
    this.body = el('div', { class: 'ed-body' }, this.errMark, this.hl, this.ta);
    this.ac = el('div', { class: 'ac' });
    this.root = el('div', { class: 'ed' }, this.gut, this.body, this.ac);
    root.appendChild(this.root);
    this.errLine = 0;
    this.acItems = []; this.acSel = 0; this.acOpen = false;
    this.ta.addEventListener('input', () => { this.render(); this.opts.onChange && this.opts.onChange(this.ta.value); this._maybeComplete(); });
    this.ta.addEventListener('scroll', () => this._sync());
    this.ta.addEventListener('keydown', (e) => this._key(e));
    this.ta.addEventListener('click', () => { this._closeAc(); this._curLine(); });
    this.ta.addEventListener('keyup', (e) => { if (!['ArrowUp', 'ArrowDown'].includes(e.key) || !this.acOpen) this._curLine(); });
    this.ta.addEventListener('blur', () => setTimeout(() => this._closeAc(), 150));
    this.render();
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.setError(0); this.render(); this.ta.scrollTop = 0; }

  render() {
    const v = this.ta.value;
    this.hl.innerHTML = highlight(v);
    const n = v.split('\n').length;
    if (this._n !== n) {
      this._n = n;
      let h = '';
      for (let i = 1; i <= n; i++) h += `<div data-l="${i}">${i}</div>`;
      this.gut.innerHTML = h;
    }
    this._markErr();
    this._sync();
  }
  _sync() {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
    this.errMark.style.transform = `translateY(${-this.ta.scrollTop}px)`;
    this.gut.scrollTop = this.ta.scrollTop;
    this.gut.style.transform = '';
    const inner = this.gut;
    inner.style.marginTop = '0';
    if (this.gut.firstChild) this.gut.firstChild.style.marginTop = `${-this.ta.scrollTop % 1}px`;
  }
  _curLine() {
    const ln = this.ta.value.slice(0, this.ta.selectionStart).split('\n').length;
    if (this._cl === ln) return;
    const old = this.gut.querySelector('.cur'); if (old) old.classList.remove('cur');
    const d = this.gut.querySelector(`[data-l="${ln}"]`); if (d) d.classList.add('cur');
    this._cl = ln;
    this.opts.onCursor && this.opts.onCursor(ln, this.ta.selectionStart - this.ta.value.lastIndexOf('\n', this.ta.selectionStart - 1));
  }
  setError(line) { this.errLine = line || 0; this._markErr(); }
  _markErr() {
    const old = this.gut.querySelector('.err'); if (old) old.classList.remove('err');
    if (!this.errLine) { this.errMark.style.display = 'none'; return; }
    const d = this.gut.querySelector(`[data-l="${this.errLine}"]`); if (d) d.classList.add('err');
    this.errMark.style.display = 'block';
    this.errMark.style.top = (10 + (this.errLine - 1) * 19) + 'px';
  }
  gotoLine(line) {
    const lines = this.ta.value.split('\n');
    let pos = 0; for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    this.ta.focus(); this.ta.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
    this.ta.scrollTop = Math.max(0, (line - 6) * 19);
  }

  // edição com histórico de desfazer do navegador
  _insert(text, selStart, selEnd) {
    const ta = this.ta;
    ta.setSelectionRange(selStart, selEnd);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, selStart, selEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }

  _key(e) {
    const ta = this.ta;
    if (this.acOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.acSel = (this.acSel + 1) % this.acItems.length; this._drawAc(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.acSel = (this.acSel - 1 + this.acItems.length) % this.acItems.length; this._drawAc(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this._acceptAc(); return; }
      if (e.key === 'Escape') { e.preventDefault(); this._closeAc(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.opts.onRun && this.opts.onRun(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.opts.onSave && this.opts.onSave(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); this._toggleComment(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); this._maybeComplete(true); return; }
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    if (e.key === 'Tab') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (s === en && !e.shiftKey) { this._insert('    ', s, en); return; }
      // indentar/desindentar bloco
      let le = v.indexOf('\n', en - (en > s && v[en - 1] === '\n' ? 1 : 0)); if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const nb = block.split('\n').map(l => e.shiftKey ? l.replace(/^ {1,4}/, '') : '    ' + l).join('\n');
      this._insert(nb, ls, le);
      ta.setSelectionRange(ls, ls + nb.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const line = v.slice(ls, s);
      let ind = (line.match(/^\s*/) || [''])[0];
      const trimmed = line.replace(/#.*$/, '').trimEnd();
      if (trimmed.endsWith(':')) ind += '    ';
      else if (/^\s*(return|pass|break|continue|raise)\b/.test(line)) ind = ind.slice(0, Math.max(0, ind.length - 4));
      this._insert('\n' + ind, s, en);
      return;
    }
    if (e.key === 'Backspace' && s === en) {
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const before = v.slice(ls, s);
      if (before.length && /^ +$/.test(before)) {
        e.preventDefault();
        const k = before.length % 4 || 4;
        this._insert('', s - k, s);
        return;
      }
    }
    // fecha parênteses/colchetes automaticamente quando o próximo é espaço ou fim
    const pairs = { '(': ')', '[': ']', '{': '}' };
    if (pairs[e.key] && s === en && (!v[s] || /[\s)\]}:,]/.test(v[s]))) { e.preventDefault(); this._insert(e.key + pairs[e.key], s, en); ta.setSelectionRange(s + 1, s + 1); return; }
    if ([')', ']', '}'].includes(e.key) && v[s] === e.key && s === en) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
  }

  _toggleComment() {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', en > s && v[en - 1] === '\n' ? en - 1 : en); if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const all = lines.filter(l => l.trim()).every(l => /^\s*#/.test(l));
    const nb = lines.map(l => {
      if (!l.trim()) return l;
      if (all) return l.replace(/^(\s*)# ?/, '$1');
      const ind = l.match(/^\s*/)[0];
      return ind + '# ' + l.slice(ind.length);
    }).join('\n');
    this._insert(nb, ls, le);
    ta.setSelectionRange(ls, ls + nb.length);
  }

  // ------------------------------------------------------------ autocompletar
  _maybeComplete(force) {
    if (!this.opts.complete) return;
    const ta = this.ta, v = ta.value, s = ta.selectionStart;
    if (s !== ta.selectionEnd) { this._closeAc(); return; }
    const m = v.slice(Math.max(0, s - 80), s).match(/([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.?([A-Za-z_][A-Za-z0-9_]*)?$/);
    if (!m) { this._closeAc(); return; }
    const full = m[0];
    const dot = full.lastIndexOf('.');
    const obj = dot >= 0 ? full.slice(0, dot) : '';
    const pre = dot >= 0 ? full.slice(dot + 1) : full;
    if (!force && dot < 0 && pre.length < 2) { this._closeAc(); return; }
    // dentro de string ou comentário: não completa
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const lineBefore = v.slice(ls, s);
    if (/#/.test(lineBefore.replace(/(['"]).*?\1/g, '')) || ((lineBefore.match(/['"]/g) || []).length % 2)) { this._closeAc(); return; }
    const items = this.opts.complete(obj, pre, v);
    if (!items || !items.length || (items.length === 1 && items[0].name === pre)) { this._closeAc(); return; }
    this.acItems = items.slice(0, 40); this.acSel = 0; this.acPre = pre; this.acOpen = true;
    this._drawAc();
    // posição do cursor
    const lines = v.slice(0, s).split('\n');
    const row = lines.length - 1, col = lines[lines.length - 1].length;
    const cw = this._charW || (this._charW = measureChar(this.ta));
    const x = 42 + 12 + col * cw - this.ta.scrollLeft - pre.length * cw;
    const y = 10 + (row + 1) * 19 - this.ta.scrollTop + 2;
    this.ac.style.left = Math.max(0, Math.min(x, this.root.clientWidth - 240)) + 'px';
    this.ac.style.top = (y + 190 > this.root.clientHeight ? y - 19 - Math.min(220, this.acItems.length * 22) - 4 : y) + 'px';
    this.ac.style.display = 'block';
  }
  _drawAc() {
    this.ac.innerHTML = '';
    this.acItems.forEach((it, i) => {
      const d = el('div', { class: i === this.acSel ? 'on' : '' }, el('span', {}, it.name), el('small', {}, it.hint || ''));
      d.addEventListener('mousedown', (e) => { e.preventDefault(); this.acSel = i; this._acceptAc(); });
      this.ac.appendChild(d);
    });
    const on = this.ac.children[this.acSel]; if (on) on.scrollIntoView({ block: 'nearest' });
  }
  _acceptAc() {
    const it = this.acItems[this.acSel]; if (!it) return;
    const s = this.ta.selectionStart;
    const ins = it.insert || it.name;
    this._insert(ins, s - this.acPre.length, s);
    if (it.cursorBack) { const p = this.ta.selectionStart - it.cursorBack; this.ta.setSelectionRange(p, p); }
    this._closeAc();
  }
  _closeAc() { this.acOpen = false; this.ac.style.display = 'none'; }
}

function measureChar(ta) {
  const s = el('span', { style: { font: getComputedStyle(ta).font, visibility: 'hidden', position: 'absolute', whiteSpace: 'pre' } }, 'MMMMMMMMMM');
  document.body.appendChild(s); const w = s.getBoundingClientRect().width / 10; s.remove();
  return w || 7.5;
}
