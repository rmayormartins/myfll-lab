// ============================================================================
//  MyFLL.lab :: missions.js
//  Avaliação das missões, fichas de precisão, partida de 2:30 e o painel.
// ============================================================================
import { el, fmt, toast, modal, store } from './ui.js';
import { HOME_W, HOME_E, PRECISION, THEMES, generateSeason } from './mapgen.js';
import { OBJ_TYPES } from '../common/objects.js';

export const MATCH_S = 150;

function inRect(z, x, y, m = 0) {
  const a = -(z.a || 0) * Math.PI / 180, dx = x - z.x, dy = y - z.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= z.w / 2 - m && Math.abs(ly) <= z.h / 2 - m;
}
function inHomeBox(H, x, y) { return x >= H.x0 && x <= H.x1 && y >= H.y0 && y <= H.y1; }
export function inAnyHome(x, y) { return inHomeBox(HOME_W, x, y) || inHomeBox(HOME_E, x, y); }

// cantos do robô (mm, mundo) a partir dos limites do layout
export function robotCorners(r, B) {
  const c = Math.cos(r.a), s = Math.sin(r.a);
  return [[B.maxX, B.maxY], [B.maxX, B.minY], [B.minX, B.minY], [B.minX, B.maxY]].map(([lx, ly]) => [r.x + c * lx - s * ly, r.y + s * lx + c * ly]);
}

export class Missions {
  constructor(app) {
    this.app = app;
    this.visited = {};
    this.match = null;     // { t0, left, tokens, running, done }
    this.scores = {};
    this.total = 0;
  }

  reset() { this.visited = {}; this.scores = {}; }

  objRadiusDef(id) {
    const d = this.app.state.objects.find(o => o.id === id);
    if (!d) return 20;
    const t = OBJ_TYPES[d.type];
    return d.r ?? t.r ?? Math.max(d.w ?? t.w ?? 40, d.d ?? t.d ?? 40) / 2;
  }

  evaluate(f) {
    const st = this.app.state;
    const objs = {};
    for (const o of f.objs || []) objs[o.id] = o;
    const r = f.robot;
    const B = this.app.robotBounds();
    let total = 0;
    const res = {};
    for (const m of st.missions) {
      let pts = 0, stt = 'todo', info = '';
      if (m.kind === 'objInZone') {
        const o = objs[m.obj];
        if (o) {
          const rad = this.objRadiusDef(m.obj) * 0.7;
          if (inRect(m.zone, o.x, o.y, rad) && !(o.z > 5)) { pts = m.pts; stt = 'done'; }
          else if (inRect(m.zone, o.x, o.y) && !(o.z > 5)) { pts = m.partial || 0; stt = 'part'; info = 'parcialmente'; }
        }
      } else if (m.kind === 'mech') {
        const o = objs[m.obj];
        if (o && o.done) { pts = m.pts; stt = 'done'; }
        else if (o && o.state > 0.05) { stt = 'part'; info = Math.round(o.state * 100) + '%'; }
      } else if (m.kind === 'collect') {
        let n = 0;
        for (const id of m.objs) { const o = objs[id]; if (o && inAnyHome(o.x, o.y) && !(o.z > 5)) n++; }
        pts = n * m.ptsEach; stt = n === m.objs.length ? 'done' : (n ? 'part' : 'todo'); info = `${n}/${m.objs.length}`;
      } else if (m.kind === 'notMoved') {
        const o = objs[m.obj];
        const d0 = st.objects.find(q => q.id === m.obj);
        if (o && d0) {
          const moved = Math.hypot(o.x - d0.x, o.y - d0.y);
          if (moved <= (m.tol || 12)) { pts = m.pts; stt = 'done'; } else { stt = 'fail'; info = 'movida ' + Math.round(moved) + ' mm'; }
        }
      } else if (m.kind === 'robotInZone' && r) {
        const cs = robotCorners(r, B);
        const all = cs.every(([x, y]) => inRect(m.zone, x, y));
        const cen = inRect(m.zone, r.x, r.y);
        if (all) { pts = m.pts; stt = 'done'; } else if (cen) { pts = m.partial || 0; stt = 'part'; info = 'parcialmente'; }
      } else if (m.kind === 'visit' && r) {
        const vis = this.visited[m.id] || (this.visited[m.id] = {});
        for (const id of m.objs) {
          const d0 = st.objects.find(q => q.id === id); if (!d0) continue;
          if (Math.hypot(r.x - d0.x, r.y - d0.y) <= (m.radius || 45)) vis[id] = true;
        }
        const n = Object.keys(vis).length;
        pts = n * m.ptsEach; stt = n === m.objs.length ? 'done' : (n ? 'part' : 'todo'); info = `${n}/${m.objs.length}`;
      }
      res[m.id] = { pts, stt, info };
      total += pts;
    }
    let prec = 0;
    if (this.match) { prec = PRECISION[Math.max(0, Math.min(6, this.match.tokens))]; total += prec; }
    this.scores = res; this.total = total; this.prec = prec;
    return total;
  }

  // ------------------------------------------------------------ partida
  startMatch() {
    this.app.resetField(true);
    this.reset();
    this.match = { left: MATCH_S, tokens: 6, running: true, lastT: null, done: false };
    this.app.stopProgram(true);
    toast('Partida iniciada: 2:30. Rode seus programas a partir da BASE.', 'ok', 3500);
    this.render();
  }
  tick(f) {
    const M = this.match;
    if (!M || !M.running) return;
    if (M.lastT === null) { M.lastT = f.T; return; }
    const dt = Math.max(0, f.T - M.lastT); M.lastT = f.T;
    M.left -= dt;
    if (M.left <= 0) { M.left = 0; this.endMatch(); }
  }
  interrupt() {
    const M = this.match; if (!M || !M.running) return;
    const r = this.app.frame && this.app.frame.robot;
    const B = this.app.robotBounds();
    let inside = false;
    if (r) inside = robotCorners(r, B).some(([x, y]) => inAnyHome(x, y));
    if (!inside) { M.tokens = Math.max(0, M.tokens - 1); toast(`Interrupção fora da BASE: perdeu 1 ficha de precisão (restam ${M.tokens}).`, 'warn', 3500); }
    else toast('Robô recolhido na BASE (sem penalidade).', '', 2000);
    this.app.stopProgram(true);
    this.app.placeRobotHome(r && r.x > 1181 ? 'E' : 'W');
    this.render();
  }
  endMatch() {
    const M = this.match; if (!M) return;
    M.running = false; M.done = true;
    this.app.stopProgram(true);
    this.evaluate(this.app.frame || {});
    const st = this.app.state;
    const key = 'myfll.best.' + (st.map.name || '');
    const best = store.get(key, 0);
    if (this.total > best) store.set(key, this.total);
    const box = el('div', { class: 'result' });
    for (const m of st.missions) {
      const s = this.scores[m.id] || { pts: 0 };
      box.append(el('span', {}, `M${String(m.num).padStart(2, '0')} ${m.name}`), el('span', {}, String(s.pts)));
    }
    box.append(el('span', {}, `Fichas de precisão (${M.tokens})`), el('span', {}, String(this.prec || 0)));
    box.append(el('span', { class: 'tot' }, 'TOTAL'), el('span', { class: 'tot' }, String(this.total)));
    const recorde = Math.max(best, this.total);
    box.append(el('span', { class: 'mute' }, 'Recorde nesta mesa'), el('span', { class: 'mute' }, String(recorde)));
    modal('Fim da partida', box, [{ label: 'Nova partida', cls: 'good', value: 'again' }, { label: 'Fechar', value: 'close' }]).then(v => { if (v === 'again') this.startMatch(); });
    this.render();
  }
  stopMatch() { this.match = null; this.render(); }

  hudHtml() {
    const M = this.match;
    if (!M) return '';
    const s = Math.ceil(M.left), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    let tok = '';
    for (let i = 0; i < 6; i++) tok += `<i class="${i < M.tokens ? '' : 'lost'}"></i>`;
    return `<div class="matchhud"><span class="clock ${M.left < 30 ? 'low' : ''}">${mm}:${ss}</span><span class="pts">${this.total} pts</span><span class="tok" title="Fichas de precisão">${tok}</span></div>`;
  }

  // ------------------------------------------------------------ painel
  mount(root) { this.root = root; this.render(); }
  render() {
    const root = this.root; if (!root) return;
    const app = this.app, st = app.state;
    root.innerHTML = '';
    // gerador
    const seed = el('input', { type: 'number', value: st.map.seed || Math.floor(Math.random() * 9000 + 1000), style: { width: '90px' } });
    const theme = el('select', { class: 'in' }, ...Object.entries(THEMES).map(([k, t]) => el('option', { value: k, selected: st.map.theme === k }, t.name)));
    const cnt = el('input', { type: 'number', value: 7, min: 1, max: 10, style: { width: '56px' } });
    const gen = (keep) => {
      const s = +seed.value || 1;
      const r = generateSeason(s, { theme: theme.value, count: +cnt.value, keepMap: keep ? st.map : null });
      app.loadField(r, true);
      toast(keep ? `Missões geradas na mesa atual (semente ${s}).` : `Temporada ${THEMES[theme.value].name} gerada (semente ${s}).`, 'ok');
    };
    root.appendChild(el('div', { class: 'sec' },
      el('h2', {}, el('span', { class: 'n' }, '01'), 'Gerar missões', el('span', { class: 'aux' }, st.map.name || '')),
      el('div', { class: 'fld2' }, el('label', {}, 'Tema'), theme),
      el('div', { class: 'fld2' }, el('label', {}, 'Semente'), el('div', { class: 'row' }, seed, el('button', { class: 'btn xs', title: 'Sortear', onclick: () => { seed.value = Math.floor(Math.random() * 90000 + 1000); } }, '🎲'))),
      el('div', { class: 'fld2' }, el('label', {}, 'Nº de missões'), cnt),
      el('div', { class: 'row', style: { marginTop: '6px' } },
        el('button', { class: 'btn pri sm', onclick: () => gen(false) }, 'Gerar temporada'),
        el('button', { class: 'btn sm', title: 'Mantém as linhas e desenhos atuais e troca só as missões', onclick: () => gen(true) }, 'Missões nesta mesa')),
      el('p', { class: 'hint' }, 'A mesma semente sempre gera a mesma mesa: combine um número com a equipe para treinarem no mesmo desafio.')));
    // partida
    const M = this.match;
    const sec = el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '02'), 'Partida', el('span', { class: 'aux' }, '2:30 como na FLL')));
    if (!M || M.done) sec.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn good', onclick: () => this.startMatch() }, '▶ Iniciar partida'), M ? el('button', { class: 'btn sm', onclick: () => this.stopMatch() }, 'Sair do modo partida') : null));
    else sec.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn warn sm', title: 'Pegar o robô com a mão (perde ficha se estiver fora da BASE)', onclick: () => this.interrupt() }, '✋ Pegar robô'), el('button', { class: 'btn bad sm', onclick: () => this.endMatch() }, 'Encerrar')));
    sec.appendChild(el('p', { class: 'hint' }, 'Na partida o robô começa na BASE. Pegar o robô fora da BASE custa uma ficha de precisão (6 fichas valem 50 pontos). Missões de estacionamento contam no fim.'));
    root.appendChild(sec);
    // lista
    const list = el('div', { class: 'sec' }, el('h2', {}, el('span', { class: 'n' }, '03'), 'Missões', el('span', { class: 'aux', id: 'misTotal' }, this.total + ' pts')));
    if (!st.missions.length) list.appendChild(el('p', { class: 'hint' }, 'Nenhuma missão nesta mesa. Gere uma temporada acima ou adicione abaixo.'));
    this.cards = {};
    for (const m of st.missions) {
      const c = el('div', { class: 'mis' },
        el('div', { class: 'ic' }, String(m.num).padStart(2, '0')),
        el('h3', {}, m.name),
        el('div', { class: 'pts' }, el('span', { class: 'cur' }, '0'), ' / ' + m.pts,
          el('button', { class: 'del', title: 'Remover missão', onclick: () => { st.missions = st.missions.filter(x => x !== m); app.saveSoon(); this.render(); } }, '×')),
        el('p', {}, m.desc, ' ', el('span', { class: 'mute info' }, '')));
      c.addEventListener('mouseenter', () => app.highlightMission(m));
      c.addEventListener('mouseleave', () => app.highlightMission(null));
      this.cards[m.id] = c;
      list.appendChild(c);
    }
    if (this.match) list.appendChild(el('div', { class: 'mis' }, el('div', { class: 'ic' }, '★'), el('h3', {}, 'Fichas de precisão'), el('div', { class: 'pts' }, el('span', { id: 'precPts' }, String(this.prec || 0)), ' / 50'), el('p', {}, 'Cada interrupção fora da BASE tira uma ficha.')));
    root.appendChild(list);
    // adicionar
    root.appendChild(this._addForm());
    this.update();
  }
  update() {
    if (!this.cards) return;
    for (const id in this.cards) {
      const c = this.cards[id], s = this.scores[id]; if (!s) continue;
      c.classList.toggle('done', s.stt === 'done'); c.classList.toggle('part', s.stt === 'part');
      c.querySelector('.cur').textContent = String(s.pts);
      c.querySelector('.info').textContent = s.info ? '(' + s.info + ')' : '';
    }
    const t = document.getElementById('misTotal'); if (t) t.textContent = this.total + ' pts';
    const p = document.getElementById('precPts'); if (p) p.textContent = String(this.prec || 0);
  }

  _addForm() {
    const app = this.app, st = app.state;
    const kinds = [['mech', 'Ativar mecanismo'], ['objInZone', 'Objeto na zona'], ['robotInZone', 'Robô na zona (fim)'], ['notMoved', 'Não mover objeto'], ['collect', 'Levar à BASE'], ['visit', 'Passar pelos marcadores']];
    const kind = el('select', { class: 'in' }, ...kinds.map(([v, t]) => el('option', { value: v }, t)));
    const objSel = el('select', { class: 'in' });
    const zoneSel = el('select', { class: 'in' });
    const pts = el('input', { type: 'number', value: 20, style: { width: '64px' } });
    const name = el('input', { type: 'text', placeholder: 'Nome da missão' });
    const fill = () => {
      objSel.innerHTML = ''; zoneSel.innerHTML = '';
      const k = kind.value;
      const objs = st.objects.filter(o => {
        if (k === 'mech') return ['alavanca', 'empurrador', 'botao', 'bandeira'].includes(o.type);
        if (k === 'visit') return o.type === 'marcador';
        return !['alavanca', 'empurrador', 'botao', 'bandeira', 'marcador', 'parede'].includes(o.type);
      });
      for (const o of objs) objSel.appendChild(el('option', { value: o.id }, `${OBJ_TYPES[o.type].name} (${o.id})`));
      const zones = st.map.items.map((it, i) => [it, i]).filter(([it]) => it.t === 'rect');
      for (const [it, i] of zones) zoneSel.appendChild(el('option', { value: i }, `retângulo ${Math.round(it.w)}x${Math.round(it.h)} em (${Math.round(it.x)}, ${Math.round(it.y)})`));
      objSel.parentElement && (objSel.parentElement.style.display = ['robotInZone'].includes(k) ? 'none' : '');
      zoneSel.parentElement && (zoneSel.parentElement.style.display = ['objInZone', 'robotInZone'].includes(k) ? '' : 'none');
    };
    kind.addEventListener('change', fill);
    const add = () => {
      const k = kind.value;
      const num = (st.missions.reduce((a, m) => Math.max(a, m.num), 0) || 0) + 1;
      const M = { id: 'm' + Date.now().toString(36), num, kind: k, name: name.value || kinds.find(x => x[0] === k)[1], desc: '', pts: +pts.value || 10 };
      const zi = +zoneSel.value;
      const z = st.map.items[zi];
      if (k === 'mech' || k === 'objInZone' || k === 'notMoved') { if (!objSel.value) return toast('Escolha um objeto (coloque um na aba MESA).', 'warn'); M.obj = objSel.value; }
      if (k === 'objInZone' || k === 'robotInZone') { if (!z) return toast('Desenhe um retângulo na aba MESA para servir de zona.', 'warn'); M.zone = { x: z.x, y: z.y, w: z.w, h: z.h, a: z.a || 0 }; M.partial = Math.round(M.pts / 2); }
      if (k === 'robotInZone') M.endOnly = true;
      if (k === 'notMoved') M.tol = 12;
      if (k === 'collect' || k === 'visit') {
        const ids = [...objSel.selectedOptions].map(o => o.value);
        M.objs = ids.length ? ids : [...objSel.options].map(o => o.value);
        if (!M.objs.length) return toast('Não há objetos adequados na mesa.', 'warn');
        M.ptsEach = M.pts; M.pts = M.ptsEach * M.objs.length; M.radius = 45;
      }
      M.desc = { mech: 'Ative o mecanismo.', objInZone: 'Leve o objeto até a zona.', robotInZone: 'Termine com o robô na zona.', notMoved: 'Não mexa no objeto.', collect: 'Leve os objetos para a BASE.', visit: 'Passe sobre os marcadores.' }[k];
      st.missions.push(M); app.saveSoon(); this.render();
      toast('Missão adicionada.', 'ok');
    };
    const box = el('div', { class: 'sec' },
      el('h2', {}, el('span', { class: 'n' }, '04'), 'Criar missão'),
      el('div', { class: 'fld2' }, el('label', {}, 'Tipo'), kind),
      el('div', { class: 'fld2' }, el('label', {}, 'Objeto'), objSel),
      el('div', { class: 'fld2' }, el('label', {}, 'Zona'), zoneSel),
      el('div', { class: 'fld2' }, el('label', {}, 'Nome'), name),
      el('div', { class: 'fld2' }, el('label', {}, 'Pontos'), el('div', { class: 'row' }, pts, el('button', { class: 'btn pri sm', onclick: add }, 'Adicionar'))));
    setTimeout(fill, 0);
    return box;
  }
}
export { fmt };
