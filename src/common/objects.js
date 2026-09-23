// ============================================================================
//  MyFLL.lab :: objects.js
//  Catálogo dos modelos de missão (peças sobre a mesa) e da mesa em si.
//  Dimensões em mm, massas em gramas, ângulos em graus.
// ============================================================================

export const MAT = { W: 2362, H: 1143 };                 // tapete 93 x 45 pol.
export const TABLE = { x0: -38.2, x1: 2400.2, y0: 0, y1: 1219.2, wallH: 76, wallT: 38 };

export const OBJ_TYPES = {
  caixa: { name: 'Caixa', desc: 'Bloco que pode ser empurrado ou levado até uma zona.', w: 64, d: 64, h: 48, mass: 60, color: '#e8a21a', mu: 0.45 },
  cilindro: { name: 'Cilindro', desc: 'Peça redonda, gira quando empurrada fora do centro.', r: 24, h: 56, mass: 35, color: '#2f86ff', mu: 0.4 },
  bola: { name: 'Bola', desc: 'Rola com facilidade: difícil de controlar.', r: 20, h: 40, mass: 25, color: '#ff4d6d', mu: 0.05 },
  cesta: { name: 'Cesta com alça', desc: 'Tem uma alça: o braço frontal pode enganchar e levantar.', w: 72, d: 72, h: 44, handle: 70, mass: 50, color: '#9d5cff', mu: 0.45 },
  torre: { name: 'Torre', desc: 'Peça alta e leve. Missões pedem para não derrubar nem arrastar.', w: 40, d: 40, h: 150, mass: 30, color: '#ffffff', mu: 0.4 },
  parede: { name: 'Barreira fixa', desc: 'Obstáculo parafusado na mesa.', w: 200, d: 24, h: 60, mass: 0, color: '#6b7d8f', fixed: true },
  alavanca: { name: 'Alavanca', desc: 'Barra articulada: empurre para girar e ativar.', len: 140, h: 60, mass: 40, color: '#ff7a1a', swing: 90, dir: 1 },
  empurrador: { name: 'Empurrador', desc: 'Trilho: empurre até o fim do curso.', w: 70, d: 40, h: 60, travel: 90, mass: 60, color: '#27e0c8', spring: 0 },
  botao: { name: 'Botão de pressão', desc: 'Placa que precisa ser pressionada de cima pelo braço.', w: 60, d: 60, h: 36, force: 1.0, color: '#ffd000' },
  bandeira: { name: 'Bandeira', desc: 'Levante a bandeira passando o braço por baixo e subindo.', w: 60, d: 40, h: 50, color: '#ff2a2a' },
  marcador: { name: 'Ponto de passagem', desc: 'Área no tapete: o robô precisa passar por cima.', r: 45, color: '#37d5ff' },
};

export function objDefaults(type) {
  const t = OBJ_TYPES[type];
  const o = { type };
  for (const k of ['w', 'd', 'h', 'r', 'mass', 'color', 'len', 'swing', 'dir', 'travel', 'spring', 'handle', 'force']) if (t[k] !== undefined) o[k] = t[k];
  return o;
}

// raio aproximado (mm) para desenho e seleção
export function objRadius(o) {
  if (o.r) return o.r;
  if (o.type === 'alavanca') return (o.len || 140) / 2 + 20;
  return Math.hypot(o.w || 50, o.d || 50) / 2;
}
