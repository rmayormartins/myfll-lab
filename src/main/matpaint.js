// ============================================================================
//  MyFLL.lab :: matpaint.js
//  Desenha o tapete (vetorial) numa tela de 1 px/mm. A mesma imagem vira a
//  textura 3D e os dados que o sensor de cor lê no worker.
// ============================================================================
import { MAT } from '../common/objects.js';

export const MAT_S = 1;   // px por mm

export function makeMatCanvas() {
  const c = document.createElement('canvas');
  c.width = Math.round(MAT.W * MAT_S); c.height = Math.round(MAT.H * MAT_S);
  return c;
}

function X(x) { return x * MAT_S; }
function Y(y) { return (MAT.H - y) * MAT_S; }

export function paintMat(canvas, map, opts = {}) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  g.save();
  g.fillStyle = map.bg || '#f3f1ea';
  g.fillRect(0, 0, W, H);
  // textura leve de lona impressa (determinística)
  if (map.texture !== false) {
    let s = 1234567;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    g.globalAlpha = 0.035;
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    g.globalAlpha = 1;
  }
  for (const it of map.items || []) drawItem(g, it);
  // borda impressa
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);
  g.restore();
  if (opts.selected) drawSelection(g, opts.selected);
}

export function drawItem(g, it) {
  g.save();
  switch (it.t) {
    case 'grid': {
      const step = it.step || 100;
      g.strokeStyle = it.color || 'rgba(0,0,0,.12)'; g.lineWidth = it.w || 1;
      g.beginPath();
      for (let x = step; x < MAT.W; x += step) { g.moveTo(X(x), 0); g.lineTo(X(x), Y(0)); }
      for (let y = step; y < MAT.H; y += step) { g.moveTo(0, Y(y)); g.lineTo(X(MAT.W), Y(y)); }
      g.stroke();
      if (it.labels) {
        g.fillStyle = it.color || 'rgba(0,0,0,.3)'; g.font = `${12 * MAT_S}px "JetBrains Mono", monospace`;
        for (let x = step; x < MAT.W; x += step) g.fillText(String(x), X(x) + 3, Y(0) - 4);
        for (let y = step; y < MAT.H; y += step) g.fillText(String(y), 3, Y(y) - 3);
      }
      break;
    }
    case 'rect': case 'home': {
      g.translate(X(it.x), Y(it.y));
      if (it.a) g.rotate(-it.a * Math.PI / 180);
      const w = it.w * MAT_S, h = it.h * MAT_S, r = (it.r || 0) * MAT_S;
      roundRect(g, -w / 2, -h / 2, w, h, r);
      if (it.t === 'home') {
        g.fillStyle = it.fill || 'rgba(55,140,255,.14)'; g.fill();
        // hachura
        g.save(); g.clip();
        g.strokeStyle = it.color || 'rgba(30,90,200,.35)'; g.lineWidth = 3 * MAT_S;
        for (let k = -h - w; k < w + h; k += 26 * MAT_S) { g.beginPath(); g.moveTo(-w / 2 + k, -h / 2); g.lineTo(-w / 2 + k + h, h / 2); g.stroke(); }
        g.restore();
        roundRect(g, -w / 2, -h / 2, w, h, r);
        g.strokeStyle = it.color || '#1e5bff'; g.lineWidth = 10 * MAT_S; g.stroke();
      } else {
        if (it.fill && it.fill !== 'none') { g.fillStyle = it.fill; g.fill(); }
        if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = (it.sw || 6) * MAT_S; g.stroke(); }
      }
      if (it.label) {
        g.fillStyle = it.lc || (it.t === 'home' ? (it.color || '#1e5bff') : 'rgba(0,0,0,.55)');
        const fs = (it.fs || Math.max(18, Math.min(46, Math.min(it.w, it.h) * 0.22))) * MAT_S;
        g.font = `700 ${fs}px "Chakra Petch", system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(it.label, 0, 0);
      }
      break;
    }
    case 'circle': {
      g.beginPath(); g.arc(X(it.x), Y(it.y), it.r * MAT_S, 0, Math.PI * 2);
      if (it.fill && it.fill !== 'none') { g.fillStyle = it.fill; g.fill(); }
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = (it.sw || 6) * MAT_S; g.stroke(); }
      if (it.label) {
        g.fillStyle = it.lc || 'rgba(0,0,0,.6)';
        g.font = `700 ${(it.fs || Math.max(16, it.r * 0.5)) * MAT_S}px "Chakra Petch", system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.label, X(it.x), Y(it.y));
      }
      break;
    }
    case 'line': case 'path': {
      const p = it.pts; if (!p || p.length < 2) break;
      g.strokeStyle = it.color || '#111'; g.lineWidth = (it.w || 20) * MAT_S;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(X(p[0][0]), Y(p[0][1]));
      if (it.smooth && p.length > 2) {
        for (let i = 1; i < p.length - 1; i++) {
          const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
          g.quadraticCurveTo(X(p[i][0]), Y(p[i][1]), X(mx), Y(my));
        }
        g.lineTo(X(p[p.length - 1][0]), Y(p[p.length - 1][1]));
      } else for (let i = 1; i < p.length; i++) g.lineTo(X(p[i][0]), Y(p[i][1]));
      g.stroke();
      break;
    }
    case 'text': {
      g.translate(X(it.x), Y(it.y));
      if (it.a) g.rotate(-it.a * Math.PI / 180);
      g.fillStyle = it.color || '#222';
      g.font = `${it.bold === false ? 500 : 700} ${(it.size || 40) * MAT_S}px "Chakra Petch", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(it.text || '', 0, 0);
      break;
    }
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  if (r <= 0) { g.rect(x, y, w, h); return; }
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawSelection(g, it) {
  const b = itemBounds(it); if (!b) return;
  g.save(); g.strokeStyle = '#37d5ff'; g.lineWidth = 3; g.setLineDash([10, 8]);
  g.strokeRect(X(b.x0) - 6, Y(b.y1) - 6, (b.x1 - b.x0) * MAT_S + 12, (b.y1 - b.y0) * MAT_S + 12);
  g.restore();
}

export function itemBounds(it) {
  if (it.t === 'rect' || it.t === 'home') {
    const a = (it.a || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const hw = (it.w * c + it.h * s) / 2, hh = (it.w * s + it.h * c) / 2;
    return { x0: it.x - hw, x1: it.x + hw, y0: it.y - hh, y1: it.y + hh };
  }
  if (it.t === 'circle') return { x0: it.x - it.r, x1: it.x + it.r, y0: it.y - it.r, y1: it.y + it.r };
  if (it.t === 'line' || it.t === 'path') {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of it.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = (it.w || 20) / 2;
    return { x0: x0 - w, x1: x1 + w, y0: y0 - w, y1: y1 + w };
  }
  if (it.t === 'text') { const w = (it.text || '').length * (it.size || 40) * 0.3; return { x0: it.x - w, x1: it.x + w, y0: it.y - (it.size || 40) / 2, y1: it.y + (it.size || 40) / 2 }; }
  return null;
}

// teste de clique num item (mm)
export function hitItem(it, x, y) {
  if (it.t === 'grid') return false;
  if (it.t === 'rect' || it.t === 'home') {
    const a = -(it.a || 0) * Math.PI / 180, dx = x - it.x, dy = y - it.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= it.w / 2 + 4 && Math.abs(ly) <= it.h / 2 + 4;
  }
  if (it.t === 'circle') return Math.hypot(x - it.x, y - it.y) <= it.r + 4;
  if (it.t === 'line' || it.t === 'path') {
    const w = (it.w || 20) / 2 + 6;
    for (let i = 0; i < it.pts.length - 1; i++) if (segDist(x, y, it.pts[i], it.pts[i + 1]) <= w) return true;
    return false;
  }
  const b = itemBounds(it);
  return b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

export function segDist(px, py, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy || 1;
  let t = ((px - a[0]) * vx + (py - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

export function moveItem(it, dx, dy) {
  if (it.pts) it.pts = it.pts.map(([x, y]) => [x + dx, y + dy]);
  else { it.x += dx; it.y += dy; }
}

// RGB compacto (3 bytes por pixel) para o worker
export function matRGB(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2]; }
  return { data: out, W: canvas.width, H: canvas.height, s: MAT_S };
}
