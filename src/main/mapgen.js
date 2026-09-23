// ============================================================================
//  MyFLL.lab :: mapgen.js
//  Tapetes prontos e gerador procedural (semente) de mesas e missões no estilo
//  FLL: áreas de lançamento, linhas para seguir, zonas-alvo e modelos.
// ============================================================================
import { makeRng } from '../common/rng.js';
import { MAT, OBJ_TYPES, objDefaults } from '../common/objects.js';

export const HOME_W = { x0: 0, x1: 330, y0: 0, y1: 480 };
export const HOME_E = { x0: MAT.W - 330, x1: MAT.W, y0: 0, y1: 480 };
export const PRECISION = [0, 10, 15, 25, 35, 50, 50];

export function homeItems() {
  return [
    { t: 'home', x: (HOME_W.x0 + HOME_W.x1) / 2, y: (HOME_W.y0 + HOME_W.y1) / 2, w: HOME_W.x1 - HOME_W.x0, h: HOME_W.y1 - HOME_W.y0, color: '#1e5bff', label: 'BASE', fs: 34, home: 'W' },
    { t: 'home', x: (HOME_E.x0 + HOME_E.x1) / 2, y: (HOME_E.y0 + HOME_E.y1) / 2, w: HOME_E.x1 - HOME_E.x0, h: HOME_E.y1 - HOME_E.y0, color: '#e02d6a', label: 'BASE', fs: 34, home: 'E' },
  ];
}

export const THEMES = {
  oceano: { name: 'Oceano', bg: '#eef6f8', accent: ['#1e8fd6', '#16b3a5', '#ffb020', '#e8407a', '#7b5cff'], title: 'MARÉ ALTA' },
  floresta: { name: 'Floresta', bg: '#f2f5ea', accent: ['#2e9e45', '#b8860b', '#e0562d', '#3c7bd9', '#8f4fd1'], title: 'TRILHA VERDE' },
  cidade: { name: 'Cidade', bg: '#f1f1ef', accent: ['#e0562d', '#1e5bff', '#f5b800', '#1aa37a', '#d6337a'], title: 'CIDADE VIVA' },
  espaco: { name: 'Espaço', bg: '#eceef6', accent: ['#6a4cff', '#ff7a1a', '#16b3d6', '#e8407a', '#2ea85f'], title: 'ÓRBITA' },
  fazenda: { name: 'Fazenda', bg: '#f6f2e6', accent: ['#c9751e', '#3a9a3a', '#d63a3a', '#2f7fd1', '#b0922b'], title: 'COLHEITA' },
};

// ------------------------------------------------------------ tapetes prontos
export const TEMPLATES = {
  vazio: {
    name: 'Tapete liso', desc: 'Só as bases: desenhe o que quiser.',
    make: () => ({ map: { name: 'Tapete liso', bg: '#f3f1ea', items: [...homeItems()] }, objects: [], missions: [] }),
  },
  linha: {
    name: 'Treino de linha', desc: 'Circuito preto com curvas, cruzamentos e marcas coloridas para seguidor de linha.',
    make: () => {
      const items = [...homeItems()];
      items.push({ t: 'line', pts: [[110, 250], [520, 250], [700, 420], [900, 700], [1181, 820], [1460, 700], [1660, 420], [1842, 250], [2252, 250]], w: 20, color: '#111111', smooth: true });
      items.push({ t: 'line', pts: [[520, 800], [700, 950], [1000, 980], [1181, 820], [1360, 660], [1660, 700], [1842, 880], [1842, 1000]], w: 20, color: '#111111', smooth: true });
      items.push({ t: 'line', pts: [[1181, 150], [1181, 1050]], w: 20, color: '#111111' });
      items.push({ t: 'rect', x: 1181, y: 150, w: 90, h: 60, fill: '#22b14c' }, { t: 'rect', x: 1181, y: 1050, w: 90, h: 60, fill: '#e02d2d' });
      items.push({ t: 'rect', x: 1842, y: 1000, w: 60, h: 60, fill: '#1e5bff' }, { t: 'rect', x: 520, y: 800, w: 60, h: 60, fill: '#f5c400' });
      items.push({ t: 'text', x: 1181, y: 560, text: 'SIGA A LINHA', size: 60, color: 'rgba(0,0,0,.12)' });
      return { map: { name: 'Treino de linha', bg: '#f5f4ef', items }, objects: [], missions: [] };
    },
  },
  grade: {
    name: 'Grade de precisão', desc: 'Quadriculado de 10 cm com alvos: treine distâncias e giros exatos.',
    make: () => {
      const items = [{ t: 'grid', step: 100, color: 'rgba(0,0,0,.16)', labels: true }, ...homeItems()];
      const targets = [[700, 300], [1000, 800], [1400, 500], [1800, 900], [1181, 1000], [600, 900]];
      targets.forEach(([x, y], i) => {
        items.push({ t: 'circle', x, y, r: 60, fill: 'rgba(255,176,32,.25)', stroke: '#ff7a1a', sw: 6 });
        items.push({ t: 'circle', x, y, r: 12, fill: '#ff7a1a', label: '' });
        items.push({ t: 'text', x: x + 90, y: y + 60, text: 'A' + (i + 1), size: 34, color: '#ff7a1a' });
      });
      return { map: { name: 'Grade de precisão', bg: '#fbfbf8', items }, objects: [], missions: [] };
    },
  },
  arena: {
    name: 'Arena de exemplo', desc: 'Temporada gerada com semente fixa: missões variadas para começar.',
    make: () => generateSeason(2025, { theme: 'oceano', count: 7 }),
  },
};

// ------------------------------------------------------------ utilidades
function spline(pts, n = 8) {
  // Catmull-Rom para pontos suaves
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.round(f(p0[0], p1[0], p2[0], p3[0])), Math.round(f(p0[1], p1[1], p2[1], p3[1]))]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function inHome(x, y, m = 60) {
  const h = (H) => x > H.x0 - m && x < H.x1 + m && y > H.y0 - m && y < H.y1 + m;
  return h(HOME_W) || h(HOME_E);
}

// ------------------------------------------------------------ mapa de treino
export function generateMap(seed, style = 'linhas') {
  const r = makeRng(seed);
  const themeKey = r.pick(Object.keys(THEMES));
  const th = THEMES[themeKey];
  const items = [...homeItems()];
  if (style === 'grade') return TEMPLATES.grade.make();
  // rede de linhas: tronco oeste-leste + ramos
  const mid = r.range(560, 760);
  const trunk = [[330, 240]];
  let x = 480;
  while (x < MAT.W - 480) { trunk.push([x, Math.round(mid + r.range(-240, 240))]); x += r.range(260, 380); }
  trunk.push([MAT.W - 480, Math.round(mid + r.range(-160, 160))]);
  trunk.push([MAT.W - 330, 240]);
  const tr = spline(trunk, 10);
  items.push({ t: 'line', pts: tr, w: 20, color: '#111111' });
  const branches = r.int(2, 4);
  for (let b = 0; b < branches; b++) {
    const s = tr[Math.floor(r.range(0.2, 0.8) * tr.length)];
    const up = s[1] < MAT.H / 2 ? 1 : -1;
    const end = [Math.round(s[0] + r.range(-260, 260)), Math.round(Math.max(120, Math.min(MAT.H - 120, s[1] + up * r.range(260, 420))))];
    const midp = [Math.round((s[0] + end[0]) / 2 + r.range(-120, 120)), Math.round((s[1] + end[1]) / 2)];
    items.push({ t: 'line', pts: spline([s, midp, end], 10), w: 20, color: '#111111' });
    items.push({ t: 'rect', x: end[0], y: end[1], w: 80, h: 80, fill: r.pick(th.accent) });
  }
  // marcas coloridas sobre o tronco
  for (let k = 0; k < 4; k++) {
    const p = tr[Math.floor((0.15 + k * 0.22) * tr.length)];
    items.push({ t: 'rect', x: p[0], y: p[1], w: 34, h: 70, fill: th.accent[k % th.accent.length] });
  }
  items.push({ t: 'text', x: MAT.W / 2, y: MAT.H - 90, text: th.title, size: 70, color: 'rgba(0,0,0,.08)' });
  return { map: { name: 'Mapa ' + seed, seed, theme: themeKey, bg: th.bg, items }, objects: [], missions: [] };
}

// ------------------------------------------------------------ temporada
const MTYPES = [
  { k: 'entrega', w: 3 }, { k: 'coleta', w: 2 }, { k: 'alavanca', w: 2 }, { k: 'empurrador', w: 2 },
  { k: 'botao', w: 1.5 }, { k: 'bandeira', w: 1.5 }, { k: 'cesta', w: 1 }, { k: 'torre', w: 1.2 },
  { k: 'estacionar', w: 1.2 }, { k: 'passagem', w: 1.5 },
];

export function generateSeason(seed, opts = {}) {
  const r = makeRng(seed);
  const themeKey = opts.theme && THEMES[opts.theme] ? opts.theme : r.pick(Object.keys(THEMES));
  const th = THEMES[themeKey];
  const base = opts.keepMap ? JSON.parse(JSON.stringify(opts.keepMap)) : generateMap(seed ^ 0x3c3c, 'linhas').map;
  base.items = (base.items || []).filter(it => !it.mis);
  base.bg = opts.keepMap ? base.bg : th.bg;
  base.name = opts.keepMap ? base.name : 'Temporada ' + th.name + ' #' + seed;
  base.seed = seed; base.theme = themeKey;
  const items = base.items;
  const objects = [], missions = [];
  let oid = 1;
  const nid = () => 'o' + (oid++);
  const taken = [];
  const free = (x, y, rad) => !inHome(x, y, rad) && x > 120 + rad && x < MAT.W - 120 - rad && y > 110 + rad && y < MAT.H - 110 - rad && taken.every(t => Math.hypot(t[0] - x, t[1] - y) > t[2] + rad);
  const spot = (rad, tries = 200) => {
    for (let i = 0; i < tries; i++) { const x = r.range(150, MAT.W - 150), y = r.range(140, MAT.H - 140); if (free(x, y, rad)) { taken.push([x, y, rad]); return [Math.round(x), Math.round(y)]; } }
    return null;
  };
  const count = Math.max(0, Math.min(10, opts.count ?? 7));
  // escolhe tipos sem repetir demais
  const chosen = [];
  const pool = MTYPES.slice();
  while (chosen.length < count && pool.length) {
    const tot = pool.reduce((s, m) => s + m.w, 0);
    let x = r() * tot, pick = pool[0];
    for (const m of pool) { x -= m.w; if (x <= 0) { pick = m; break; } }
    chosen.push(pick.k);
    if (['estacionar', 'cesta', 'torre', 'coleta'].includes(pick.k) || chosen.filter(c => c === pick.k).length >= 2) pool.splice(pool.indexOf(pick), 1);
  }
  let num = 1;
  const label = (x, y) => { items.push({ t: 'text', x, y, text: 'M' + String(num).padStart(2, '0'), size: 30, color: 'rgba(0,0,0,.45)', mis: true }); };
  const colorOf = (i) => th.accent[i % th.accent.length];
  for (const k of chosen) {
    const col = colorOf(num);
    const M = { id: 'm' + num, num, kind: '', pts: 0 };
    if (k === 'entrega') {
      const p = spot(110); const q = spot(130); if (!p || !q) continue;
      const type = r() < 0.6 ? 'caixa' : 'cilindro';
      const o = Object.assign(objDefaults(type), { id: nid(), x: p[0], y: p[1], a: Math.round(r.range(0, 90)), color: col });
      objects.push(o);
      const z = { x: q[0], y: q[1], w: 200, h: 200, a: 0 };
      items.push({ t: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, fill: hexA(col, 0.22), stroke: col, sw: 8, r: 12, mis: true });
      label(z.x, z.y + z.h / 2 + 26);
      Object.assign(M, { name: 'Entrega', desc: `Leve ${type === 'caixa' ? 'a caixa' : 'o cilindro'} até a zona da mesma cor.`, kind: 'objInZone', obj: o.id, zone: z, pts: 20, partial: 10 });
    } else if (k === 'coleta') {
      const n = r.int(2, 3), ids = [];
      for (let i = 0; i < n; i++) { const p = spot(70); if (!p) continue; const o = Object.assign(objDefaults('cilindro'), { id: nid(), x: p[0], y: p[1], color: col, r: 20, h: 44, mass: 25 }); objects.push(o); ids.push(o.id); items.push({ t: 'circle', x: p[0], y: p[1], r: 34, fill: 'none', stroke: hexA(col, 0.7), sw: 4, mis: true }); }
      if (!ids.length) continue;
      const lo = objects.find(o => o.id === ids[0]); label(lo.x, lo.y - 60);
      Object.assign(M, { name: 'Coleta', desc: `Traga as ${ids.length} peças redondas para qualquer BASE.`, kind: 'collect', objs: ids, ptsEach: 10, pts: 10 * ids.length });
    } else if (k === 'alavanca') {
      const p = spot(140); if (!p) continue;
      const a = r.pick([0, 90, 180, 270]) + r.range(-10, 10), dir = r() < 0.5 ? 1 : -1;
      const o = Object.assign(objDefaults('alavanca'), { id: nid(), x: p[0], y: p[1], a: Math.round(a), dir, color: col });
      objects.push(o);
      const ar = (a + dir * 45) * Math.PI / 180;
      items.push({ t: 'circle', x: p[0], y: p[1], r: 150, fill: hexA(col, 0.08), stroke: hexA(col, 0.5), sw: 4, mis: true });
      items.push({ t: 'line', pts: [[p[0] + Math.cos(ar) * 90, p[1] + Math.sin(ar) * 90], [p[0] + Math.cos(ar) * 130, p[1] + Math.sin(ar) * 130]], w: 10, color: col, mis: true });
      label(p[0], p[1] - 175);
      Object.assign(M, { name: 'Alavanca', desc: `Gire a alavanca ${dir > 0 ? 'no sentido anti-horário' : 'no sentido horário'} até o fim.`, kind: 'mech', obj: o.id, pts: 20 });
    } else if (k === 'empurrador') {
      const p = spot(140); if (!p) continue;
      const a = r.pick([0, 90, 180, 270]);
      const o = Object.assign(objDefaults('empurrador'), { id: nid(), x: p[0], y: p[1], a, color: col });
      objects.push(o);
      label(p[0], p[1] - 90);
      Object.assign(M, { name: 'Empurrador', desc: 'Empurre o bloco até o fim do trilho.', kind: 'mech', obj: o.id, pts: 15 });
    } else if (k === 'botao') {
      const p = spot(100); if (!p) continue;
      const o = Object.assign(objDefaults('botao'), { id: nid(), x: p[0], y: p[1], a: 0, color: col });
      objects.push(o);
      label(p[0], p[1] - 70);
      Object.assign(M, { name: 'Botão', desc: 'Pressione o botão de cima para baixo com o braço.', kind: 'mech', obj: o.id, pts: 25 });
    } else if (k === 'bandeira') {
      const p = spot(120); if (!p) continue;
      const a = r.pick([0, 90, 180, 270]);
      const o = Object.assign(objDefaults('bandeira'), { id: nid(), x: p[0], y: p[1], a, color: col });
      objects.push(o);
      const ar = a * Math.PI / 180;
      items.push({ t: 'rect', x: p[0] + Math.cos(ar) * 70, y: p[1] + Math.sin(ar) * 70, w: 60, h: 60, fill: hexA(col, 0.18), a, mis: true });
      label(p[0], p[1] - 80);
      Object.assign(M, { name: 'Bandeira', desc: 'Encaixe o braço sob a alavanca amarela e levante para erguer a bandeira.', kind: 'mech', obj: o.id, pts: 25 });
    } else if (k === 'cesta') {
      const p = spot(110); const q = spot(130); if (!p || !q) continue;
      const o = Object.assign(objDefaults('cesta'), { id: nid(), x: p[0], y: p[1], a: 0, color: col });
      objects.push(o);
      const z = { x: q[0], y: q[1], w: 190, h: 190, a: 0 };
      items.push({ t: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, fill: hexA(col, 0.2), stroke: col, sw: 8, r: 40, mis: true });
      label(z.x, z.y + 120);
      Object.assign(M, { name: 'Cesta', desc: 'Enganche a alça com o braço, levante e leve a cesta até a zona.', kind: 'objInZone', obj: o.id, zone: z, pts: 30, partial: 15 });
    } else if (k === 'torre') {
      const p = spot(90); if (!p) continue;
      const o = Object.assign(objDefaults('torre'), { id: nid(), x: p[0], y: p[1], a: 0, color: col });
      objects.push(o);
      items.push({ t: 'circle', x: p[0], y: p[1], r: 60, fill: 'none', stroke: col, sw: 5, mis: true });
      label(p[0], p[1] - 85);
      Object.assign(M, { name: 'Torre intacta', desc: 'Não encoste na torre: ela precisa terminar no lugar.', kind: 'notMoved', obj: o.id, pts: 15, tol: 12, x: p[0], y: p[1] });
    } else if (k === 'estacionar') {
      const q = spot(160); if (!q) continue;
      const z = { x: q[0], y: q[1], w: 280, h: 280, a: 0 };
      items.push({ t: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, fill: 'none', stroke: col, sw: 10, r: 6, label: 'P', lc: hexA(col, 0.5), fs: 90, mis: true });
      label(z.x, z.y + 170);
      Object.assign(M, { name: 'Estacionamento', desc: 'Termine a partida com o robô dentro da vaga (inteiro vale mais).', kind: 'robotInZone', zone: z, pts: 20, partial: 10, endOnly: true });
    } else if (k === 'passagem') {
      const n = r.int(2, 3), ids = [];
      for (let i = 0; i < n; i++) { const p = spot(70); if (!p) continue; const o = Object.assign(objDefaults('marcador'), { id: nid(), x: p[0], y: p[1], color: col }); objects.push(o); ids.push(o.id); items.push({ t: 'circle', x: p[0], y: p[1], r: 45, fill: hexA(col, 0.25), mis: true }); items.push({ t: 'text', x: p[0], y: p[1], text: String(i + 1), size: 36, color: col, mis: true }); }
      if (!ids.length) continue;
      const lo = objects.find(o => o.id === ids[0]); label(lo.x, lo.y + 70);
      Object.assign(M, { name: 'Pontos de passagem', desc: `Passe com o centro do robô sobre os ${ids.length} círculos numerados.`, kind: 'visit', objs: ids, ptsEach: 10, pts: 10 * ids.length, radius: 45 });
    }
    if (!M.kind) continue;
    missions.push(M);
    num++;
  }
  return { map: base, objects, missions, precision: true };
}

export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export { OBJ_TYPES };
