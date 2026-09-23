// Som do hub (bipes) e do app (sons simples sintetizados) com Web Audio.
export class Audio {
  constructor() {
    this.ctx = null; this.cur = null;
    const unlock = () => { this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }
  ensure() {
    if (this.ctx) return this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    return this.ctx;
  }
  tone(freq, ms, vol = 0.5, type = 'sine', when = 0) {
    const c = this.ensure(); if (!c || c.state !== 'running') return null;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t0 = c.currentTime + when, t1 = t0 + Math.max(0.02, ms / 1000);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * 0.25, t0 + 0.008);
    g.gain.setValueAtTime(vol * 0.25, Math.max(t0 + 0.01, t1 - 0.015));
    g.gain.linearRampToValueAtTime(0, t1);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t1 + 0.02);
    return o;
  }
  event(s) {
    if (s.t === 'beep') {
      if (this.cur) { try { this.cur.stop(); } catch (e) { /* */ } }
      const types = { 1: 'sine', 2: 'square', 3: 'sawtooth', 4: 'triangle' };
      this.cur = this.tone(s.f, Math.min(s.ms, 60000), (s.v || 100) / 100, types[s.w] || 'sine');
    } else if (s.t === 'stop') { if (this.cur) { try { this.cur.stop(); } catch (e) { /* */ } this.cur = null; } }
  }
  app(a) {
    if (a.k === 'drum') { this.noise(0.08 + (a.d % 5) * 0.02, 0.4, 200 + a.d * 180); }
    else if (a.k === 'inst') { const f = 440 * Math.pow(2, (a.n - 69) / 12); this.tone(f, a.d || 400, 0.5, ['sine', 'triangle', 'square', 'sawtooth'][a.i % 4]); }
    else if (a.k === 'snd') {
      // efeito genérico: três notas derivadas do nome
      let h = 0; for (const ch of String(a.n)) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
      const base = 300 + (h % 400) * (1 + (a.p || 0) / 100);
      [0, 0.12, 0.24].forEach((w, i) => this.tone(base * (1 + i * 0.25 * ((h >> i) & 1 ? 1 : -0.5)), 110, (a.v || 100) / 100, 'triangle', w));
    }
  }
  noise(dur, vol, freq) {
    const c = this.ensure(); if (!c || c.state !== 'running') return;
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol * 0.4;
    s.connect(f).connect(g).connect(c.destination); s.start();
  }
  click() { this.tone(1800, 18, 0.25, 'square'); }
  error() { this.tone(220, 120, 0.35, 'square'); this.tone(165, 180, 0.35, 'square', 0.13); }
}
