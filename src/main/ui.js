// Utilidades de interface: criação de elementos, avisos, janelas, armazenamento.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

export function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function toast(msg, kind = '', ms = 2600) {
  const box = $('#toasts'); if (!box) return;
  const t = el('div', { class: 'toast ' + kind }, msg);
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
}

export function modal(title, body, buttons = [{ label: 'Fechar', cls: '' }]) {
  const m = $('#modal');
  m.innerHTML = '';
  const bd = el('div', { class: 'bd' });
  if (typeof body === 'string') bd.innerHTML = body; else bd.appendChild(body);
  const ft = el('div', { class: 'ft' });
  return new Promise((res) => {
    const close = (v) => { m.classList.remove('on'); m.innerHTML = ''; res(v); };
    for (const b of buttons) ft.appendChild(el('button', { class: 'btn ' + (b.cls || ''), onclick: () => close(b.value ?? b.label) }, b.label));
    m.appendChild(el('div', { class: 'box' }, el('h3', {}, title), bd, ft));
    m.classList.add('on');
    m.onclick = (e) => { if (e.target === m) close(null); };
    const k = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', k); close(null); } };
    document.addEventListener('keydown', k);
  });
}

export const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};

export function download(name, text, type = 'text/plain') {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function pickFile(accept) {
  return new Promise((res) => {
    const inp = $('#fileIn');
    inp.accept = accept || '';
    inp.value = '';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return res(null);
      const r = new FileReader();
      r.onload = () => res({ name: f.name, text: r.result });
      r.readAsText(f);
    };
    inp.click();
  });
}

export function fmt(n, d = 1) { return Number(n).toFixed(d).replace('.', ','); }
export function tabs(root, onChange) {
  const btns = $$('.tab', root);
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.toggle('on', x === b));
    const id = b.dataset.tab;
    $$('.pane', root).forEach(p => p.classList.toggle('on', p.id === 'pane-' + id));
    if (onChange) onChange(id);
  }));
}

export function uid(p = 'o') { return p + Math.random().toString(36).slice(2, 8); }

// campo numérico com deslizador
export function slider(label, value, min, max, step, onInput, unit = '') {
  const out = el('output', {}, value + unit);
  const inp = el('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { out.textContent = inp.value + unit; onInput(+inp.value, false); });
  inp.addEventListener('change', () => onInput(+inp.value, true));
  return el('div', { class: 'fld' }, el('label', {}, label), inp, out);
}

export function selectEl(options, value, onChange, cls = 'in') {
  const s = el('select', { class: cls });
  for (const o of options) {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    s.appendChild(el('option', { value: v, selected: String(v) === String(value) }, t));
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export const SPIKE_HEX = { '-1': '#000000', 0: '#101010', 1: '#ff2bd6', 2: '#8a2be2', 3: '#1e5bff', 4: '#27b5ff', 5: '#27e0c8', 6: '#22d64a', 7: '#ffe01a', 8: '#ff8a1a', 9: '#ff2a2a', 10: '#ffffff' };
export const SPIKE_NAME = { '-1': 'nenhuma', 0: 'preto', 1: 'magenta', 2: 'roxo', 3: 'azul', 4: 'azul-claro', 5: 'turquesa', 6: 'verde', 7: 'amarelo', 8: 'laranja', 9: 'vermelho', 10: 'branco' };
export function lightHex(c) { if (typeof c === 'string' && c[0] === '#') return c; return SPIKE_HEX[c] ?? '#ffffff'; }
