// ============================================================================
//  MyFLL.lab :: matimage.js
//  Imagem de fundo do tapete (arquivo do próprio usuário). A imagem fica num
//  registro em memória (id -> dataURL); o mapa guarda só { id, fit, rot },
//  assim o desfazer e o salvamento não copiam megabytes a cada passo.
// ============================================================================
const REG = new Map();          // id -> { src, img }
let listener = null;

export const FIT_NAMES = { stretch: 'esticar no tapete', contain: 'encaixar inteira', cover: 'preencher (corta)' };

export function setMatImageListener(fn) { listener = fn; }

function hashStr(s) {
  // FNV-1a sobre o tamanho e ~4000 amostras da string (rápido e estável)
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(s.length / 4000));
  for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= s.length; h = Math.imul(h, 0x01000193);
  return (h >>> 0).toString(36);
}

export function registerMatImage(src) {
  const id = 'img' + hashStr(src);
  if (!REG.has(id)) REG.set(id, { src, img: null });
  return id;
}
export function matImageSrc(id) { const e = REG.get(id); return e ? e.src : null; }

// devolve a imagem decodificada, ou null (e começa a carregar; avisa quando pronta)
export function matImageFor(id) {
  const e = REG.get(id);
  if (!e) return null;
  if (e.img && e.img.complete && e.img.naturalWidth) return e.img;
  if (!e.img) {
    e.img = new Image();
    e.img.onload = () => { if (listener) listener(id); };
    e.img.src = e.src;
  }
  return null;
}

// desenha a imagem no tapete (canvas com 1 px = 1 mm, origem no canto de cima)
export function drawMatImage(g, W, H, spec) {
  const im = spec && spec.id ? matImageFor(spec.id) : null;
  if (!im) return false;
  const iw = im.naturalWidth, ih = im.naturalHeight;
  let dw = W, dh = H;
  if (spec.fit === 'contain' || spec.fit === 'cover') {
    const k = spec.fit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
    dw = iw * k; dh = ih * k;
  }
  g.save();
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  g.translate(W / 2, H / 2);
  if (spec.rot) g.rotate(Math.PI);
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, -dw / 2, -dh / 2, dw, dh);
  g.restore();
  return true;
}

// arquivo de imagem -> dataURL JPEG (lado maior até ~2400 px, fundo branco)
export function fileToMatImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('tipo')); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      // cerca de 1 px por mm no tapete é o que o sensor de cor usa; mais que isso só pesa
      const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ src: c.toDataURL('image/jpeg', 0.9), w, h, ow: im.naturalWidth, oh: im.naturalHeight });
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
    im.src = url;
  });
}

// mapa com a imagem embutida (para exportar) e o caminho de volta (ao importar)
export function mapWithImage(map) {
  if (!map || !map.img || !map.img.id) return map;
  const src = matImageSrc(map.img.id);
  if (!src) { const m = Object.assign({}, map); delete m.img; return m; }
  return Object.assign({}, map, { img: Object.assign({}, map.img, { src }) });
}
export function adoptMapImage(map) {
  if (!map || !map.img) return map;
  if (map.img.src) {
    const id = registerMatImage(map.img.src);
    map.img = { id, fit: map.img.fit || 'stretch', rot: !!map.img.rot, name: map.img.name || '' };
  } else if (!map.img.id || !REG.has(map.img.id)) delete map.img;
  return map;
}
