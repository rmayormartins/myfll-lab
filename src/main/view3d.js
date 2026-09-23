// ============================================================================
//  MyFLL.lab :: view3d.js
//  Vista 3D (three.js): mesa, tapete, modelos de missão e o robô montado a
//  partir do layout. Coordenadas: tapete em mm (x leste, y norte); cena em
//  metros com Y para cima (Z da cena = -y do tapete).
// ============================================================================
import { layoutRobot, WHEELS, MOTORS } from '../common/catalog.js';
import { MAT, TABLE, OBJ_TYPES, objRadius } from '../common/objects.js';
import { lightHex } from './ui.js';

const T = window.THREE;
const MM = 0.001;
const DEG = Math.PI / 180;

function mat(color, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.05 }, o)); }
function box(w, h, d, m) { const g = new T.BoxGeometry(w, h, d); const x = new T.Mesh(g, m); x.castShadow = true; x.receiveShadow = true; return x; }
function cyl(r, h, m, seg = 24) { const x = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m); x.castShadow = true; x.receiveShadow = true; return x; }

// textura de viga Technic (furos)
let _beamTex = null;
function beamTex() {
  if (_beamTex) return _beamTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c9ced3'; g.beginPath(); g.arc(32, 32, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8d959c'; g.beginPath(); g.arc(32, 32, 11, 0, Math.PI * 2); g.fill();
  _beamTex = new T.CanvasTexture(c); _beamTex.colorSpace = T.SRGBColorSpace;
  _beamTex.wrapS = _beamTex.wrapT = T.RepeatWrapping;
  return _beamTex;
}
function beam(len, color = '#f4f6f7', w = 0.0078, h = 0.0078, along = 'x') {
  const t = beamTex().clone(); t.needsUpdate = true;
  t.repeat.set(Math.max(1, Math.round(len / 0.008)), 1);
  const m = new T.MeshStandardMaterial({ color, map: t, roughness: 0.5 });
  const g = along === 'x' ? new T.BoxGeometry(len, h, w) : new T.BoxGeometry(w, h, len);
  const x = new T.Mesh(g, m); x.castShadow = true; x.receiveShadow = true;
  return x;
}

export class View3D {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.h = handlers || {};
    const r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.renderer = r;
    const sc = new T.Scene();
    sc.background = new T.Color('#070b10');
    sc.fog = new T.Fog('#070b10', 6, 16);
    this.scene = sc;
    this.camera = new T.PerspectiveCamera(42, 1, 0.01, 60);
    this.center = new T.Vector3(MAT.W * MM / 2, 0, -MAT.H * MM / 2);
    this.camera.position.set(this.center.x, 1.55, this.center.z + 1.9);
    // eventos antes dos controles de órbita
    this._bindPointer();
    this.controls = new T.OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.center);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.minDistance = 0.12; this.controls.maxDistance = 7;
    this.controls.update();
    this.mode = 'orbit';
    this.objects = new Map();
    this.flags = { trail: true, sensors: true, grid: false, labels: true };
    this._lights();
    this._table();
    this._overlays();
    this.robot = null;
    this.lastFrame = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ------------------------------------------------------------ cena
  _lights() {
    const sc = this.scene;
    sc.add(new T.HemisphereLight('#cfe6ff', '#2a2016', 0.85));
    const d = new T.DirectionalLight('#fff4e6', 2.1);
    d.position.set(this.center.x - 0.8, 3.2, this.center.z + 1.6);
    d.target.position.copy(this.center);
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    const s = d.shadow.camera; s.left = -1.6; s.right = 1.6; s.top = 1.1; s.bottom = -1.1; s.near = 0.5; s.far = 7;
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.01;
    sc.add(d); sc.add(d.target);
    const f = new T.DirectionalLight('#9fc8ff', 0.35); f.position.set(this.center.x + 2, 1.5, this.center.z - 2); sc.add(f);
  }

  _table() {
    const sc = this.scene;
    const wood = mat('#8a6844', { roughness: 0.8 });
    const woodDark = mat('#5e452c', { roughness: 0.85 });
    const x0 = TABLE.x0 * MM, x1 = TABLE.x1 * MM, y0 = TABLE.y0 * MM, y1 = TABLE.y1 * MM;
    const t = TABLE.wallT * MM, h = TABLE.wallH * MM;
    // tampo
    const top = box(x1 - x0 + 2 * t, 0.018, y1 - y0 + 2 * t, woodDark);
    top.position.set((x0 + x1) / 2, -0.0095, -(y0 + y1) / 2); sc.add(top);
    const inner = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), mat('#d9d4c5', { roughness: 0.9 }));
    inner.rotation.x = -Math.PI / 2; inner.position.set((x0 + x1) / 2, -0.0004, -(y0 + y1) / 2); inner.receiveShadow = true; sc.add(inner);
    // bordas
    const wall = (cx, cy, w, d) => { const b = box(w, h, d, wood); b.position.set(cx, h / 2, -cy); sc.add(b); };
    wall((x0 + x1) / 2, y0 - t / 2, x1 - x0 + 2 * t, t);
    wall((x0 + x1) / 2, y1 + t / 2, x1 - x0 + 2 * t, t);
    wall(x0 - t / 2, (y0 + y1) / 2, t, y1 - y0);
    wall(x1 + t / 2, (y0 + y1) / 2, t, y1 - y0);
    // pés e chão
    const legM = mat('#2a3440', { roughness: 0.7 });
    for (const [lx, ly] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const l = box(0.06, 0.74, 0.06, legM); l.position.set(lx + (lx < 1 ? 0.1 : -0.1), -0.39, -(ly + (ly < 0.5 ? 0.1 : -0.1))); sc.add(l);
    }
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), mat('#0b1016', { roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(this.center.x, -0.76, this.center.z); floor.receiveShadow = true; sc.add(floor);
    // tapete
    this.matMesh = new T.Mesh(new T.PlaneGeometry(MAT.W * MM, MAT.H * MM), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }));
    this.matMesh.rotation.x = -Math.PI / 2;
    this.matMesh.position.set(MAT.W * MM / 2, 0.0002, -MAT.H * MM / 2);
    this.matMesh.receiveShadow = true;
    sc.add(this.matMesh);
  }

  setMatCanvas(c) {
    if (!this.matTex) {
      this.matTex = new T.CanvasTexture(c);
      this.matTex.colorSpace = T.SRGBColorSpace;
      this.matTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.matMesh.material.map = this.matTex; this.matMesh.material.needsUpdate = true;
    } else { this.matTex.image = c; }
    this.matTex.needsUpdate = true;
  }
  matChanged() { if (this.matTex) this.matTex.needsUpdate = true; }

  _overlays() {
    const sc = this.scene;
    // trilha
    this.trailMax = 6000;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.trailMax * 3), 3));
    g.setDrawRange(0, 0);
    this.trail = new T.Line(g, new T.LineBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85 }));
    this.trail.frustumCulled = false;
    this.trailN = 0; this.trailLast = null;
    sc.add(this.trail);
    // raio do sensor de distância e pontos do sensor de cor
    this.rays = new T.Group(); sc.add(this.rays);
    this.spots = new T.Group(); sc.add(this.spots);
    // cursor / pré-visualização de desenho
    this.cursor = new T.Mesh(new T.RingGeometry(0.008, 0.011, 32), new T.MeshBasicMaterial({ color: '#37d5ff', transparent: true, opacity: 0.9, depthTest: false }));
    this.cursor.rotation.x = -Math.PI / 2; this.cursor.visible = false; this.cursor.renderOrder = 10; sc.add(this.cursor);
    this.preview = new T.Group(); sc.add(this.preview);
    this.selBox = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: '#37d5ff' }));
    this.selBox.visible = false; sc.add(this.selBox);
    this.ghost = null;
  }

  clearTrail() { this.trailN = 0; this.trailLast = null; this.trail.geometry.setDrawRange(0, 0); }

  // ------------------------------------------------------------ robô
  buildRobot(cfg) {
    if (this.robot) { this.scene.remove(this.robot.group); disposeTree(this.robot.group); }
    const L = layoutRobot(cfg);
    const G = new T.Group();
    const R = { group: G, wheels: [], lifts: [], sweeps: [], hubMx: null, center: null, bt: null, colorLeds: {}, distEyes: {}, cfg, layout: L };
    const white = mat('#f4f6f7', { roughness: 0.45 });
    const teal = mat('#1f8f9e', { roughness: 0.5 });
    const dark = mat('#1d2226', { roughness: 0.6 });
    const gray = mat('#a7b0b8', { roughness: 0.5 });
    const P = (p) => new T.Vector3(p.x * MM, p.z * MM, -p.y * MM);
    const ch = cfg.chassis;
    for (const p of L.parts) {
      switch (p.kind) {
        case 'chassis': {
          const g = new T.Group();
          const len = p.w * MM, wid = p.d * MM, z = (ch.clearance + 4) * MM, zt = (ch.clearance + ch.height - 4) * MM;
          for (const zz of [z, zt]) {
            for (const s of [1, -1]) { const b = beam(len, '#f4f6f7'); b.position.set(p.x * MM, zz, -s * (wid / 2 - 0.004)); g.add(b); }
            for (const xx of [p.x + p.w / 2 - 4, p.x - p.w / 2 + 4]) { const b = beam(wid, '#1f8f9e', 0.0078, 0.0078, 'z'); b.position.set(xx * MM, zz, 0); g.add(b); }
          }
          // montantes e placa
          for (const xx of [p.x + p.w / 2 - 4, p.x - p.w / 2 + 4]) for (const s of [1, -1]) {
            const b = box(0.0078, zt - z, 0.0078, white); b.position.set(xx * MM, (z + zt) / 2, -s * (wid / 2 - 0.004)); g.add(b);
          }
          const plate = box(len - 0.02, 0.003, wid - 0.02, mat('#2b3640', { roughness: 0.8 }));
          plate.position.set(p.x * MM, z + 0.002, 0); g.add(plate);
          G.add(g); break;
        }
        case 'wheel': {
          const wh = WHEELS[p.wheel] || WHEELS.spike56;
          const g = new T.Group();
          const tire = cyl(wh.d / 2 * MM, wh.w * MM, mat('#15181b', { roughness: 0.9 }), 32);
          tire.rotation.x = Math.PI / 2; g.add(tire);
          const hub = cyl(wh.d / 2 * MM * 0.62, wh.w * MM * 1.04, mat('#b9c2c9', { roughness: 0.4 }), 24);
          hub.rotation.x = Math.PI / 2; g.add(hub);
          for (let k = 0; k < 6; k++) {
            const sp = box(wh.d * MM * 0.5, 0.003, 0.004, mat('#7d8790'));
            sp.rotation.z = k * Math.PI / 3; sp.position.z = (p.side > 0 ? 1 : -1) * wh.w * MM * 0.53; g.add(sp);
          }
          g.position.copy(P(p));
          G.add(g); R.wheels.push({ g, side: p.side });
          break;
        }
        case 'motor': {
          const m = MOTORS[p.motor] || MOTORS.large;
          const g = new T.Group();
          const body = box(p.w * MM, p.h * MM, p.d * MM, white); g.add(body);
          const disc = cyl(m.disc / 2 * MM, 0.004, teal, 20);
          if (p.vertical) { disc.position.y = -p.h / 2 * MM - 0.002; }
          else { disc.rotation.x = Math.PI / 2; disc.position.z = -(p.faceY || 1) * (p.d / 2 * MM + 0.002); }
          if (p.role === 'drive') disc.position.x = p.w * MM * 0.22;
          g.add(disc);
          const lbl = box(p.w * MM * 0.5, 0.0015, p.d * MM * 0.4, mat('#d7dde2')); lbl.position.y = p.h / 2 * MM + 0.0008; g.add(lbl);
          g.position.copy(P(p));
          G.add(g);
          break;
        }
        case 'caster': {
          const g = new T.Group();
          const ball = new T.Mesh(new T.SphereGeometry(Math.min(8, p.h / 2) * MM, 20, 14), mat('#d0d6db', { metalness: 0.8, roughness: 0.25 }));
          ball.position.y = Math.min(8, p.h / 2) * MM - p.h / 2 * MM; ball.castShadow = true; g.add(ball);
          const holder = box(p.w * MM, p.h * MM * 0.45, p.d * MM, white); holder.position.y = p.h * MM * 0.25; g.add(holder);
          g.position.copy(P(p)); G.add(g); break;
        }
        case 'hub': {
          const g = new T.Group();
          const flat = p.mount !== 'upright';
          const hb = [88, 56, 32];
          const inner = new T.Group();
          const body = box(hb[0] * MM, hb[2] * MM, hb[1] * MM, mat('#f5c400', { roughness: 0.45 })); inner.add(body);
          const face = box(hb[0] * MM * 0.9, 0.002, hb[1] * MM * 0.86, mat('#f3f3ee', { roughness: 0.4 })); face.position.y = hb[2] / 2 * MM + 0.001; inner.add(face);
          // matriz 5x5
          const c = document.createElement('canvas'); c.width = 80; c.height = 80;
          const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
          const mx = new T.Mesh(new T.PlaneGeometry(0.03, 0.03), new T.MeshBasicMaterial({ map: tex }));
          mx.rotation.x = -Math.PI / 2; mx.rotation.z = -Math.PI / 2; mx.position.set(0.012, hb[2] / 2 * MM + 0.0022, 0); inner.add(mx);
          R.hubMx = { c, tex, last: '' };
          const btn = cyl(0.008, 0.003, mat('#e4e4de'), 24); btn.position.set(-0.012, hb[2] / 2 * MM + 0.0025, 0); inner.add(btn);
          const ring = new T.Mesh(new T.RingGeometry(0.0055, 0.0075, 28), new T.MeshBasicMaterial({ color: '#ffffff' }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(-0.012, hb[2] / 2 * MM + 0.0042, 0); inner.add(ring);
          R.center = ring;
          const bt = new T.Mesh(new T.CircleGeometry(0.0022, 16), new T.MeshBasicMaterial({ color: '#1e5bff' }));
          bt.rotation.x = -Math.PI / 2; bt.position.set(0.036, hb[2] / 2 * MM + 0.0026, -0.02); inner.add(bt);
          R.bt = bt;
          for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
            const pt = box(0.009, 0.007, 0.002, dark); pt.position.set(0.025 - k * 0.022, 0, s * hb[1] / 2 * MM); inner.add(pt);
          }
          if (!flat) { inner.rotation.z = Math.PI / 2; inner.rotation.y = Math.PI; }
          inner.rotation.y += (p.rot || 0) * DEG;
          g.add(inner);
          g.position.copy(P(p)); G.add(g); break;
        }
        case 'color': {
          const g = new T.Group();
          const body = box(p.w * MM, p.h * MM, p.d * MM, white); g.add(body);
          const face = box(p.w * MM * 0.8, 0.002, p.d * MM * 0.8, dark); face.position.y = -p.h / 2 * MM - 0.0005; g.add(face);
          const led = new T.Mesh(new T.CircleGeometry(0.004, 16), new T.MeshBasicMaterial({ color: '#ffffff' }));
          led.rotation.x = Math.PI / 2; led.position.y = -p.h / 2 * MM - 0.0018; g.add(led);
          g.position.copy(P(p)); G.add(g); R.colorLeds[p.port] = led; break;
        }
        case 'distance': {
          const g = new T.Group();
          const body = box(p.w * MM, p.h * MM, p.d * MM, white); g.add(body);
          const face = box(0.003, p.h * MM * 0.9, p.d * MM * 0.92, dark); face.position.x = p.w / 2 * MM + 0.0012; g.add(face);
          const eyes = [];
          for (const s of [1, -1]) {
            const e = cyl(0.0085, 0.006, mat('#0d0f11', { roughness: 0.3 }), 20); e.rotation.z = Math.PI / 2; e.position.set(p.w / 2 * MM + 0.004, 0, s * 0.013); g.add(e);
            const ring = new T.Mesh(new T.RingGeometry(0.0088, 0.0105, 24), new T.MeshBasicMaterial({ color: '#222a30' }));
            ring.rotation.y = Math.PI / 2; ring.position.set(p.w / 2 * MM + 0.0072, 0, s * 0.013); g.add(ring); eyes.push(ring);
          }
          g.rotation.y = (p.rot || 0) * DEG;
          g.position.copy(P(p)); G.add(g); R.distEyes[p.port] = eyes; break;
        }
        case 'force': {
          const g = new T.Group();
          const body = box(p.w * MM, p.h * MM, p.d * MM, white); g.add(body);
          const b = cyl(0.006, 0.008, dark, 18); b.rotation.z = Math.PI / 2; b.position.x = p.w / 2 * MM + 0.004; g.add(b);
          g.rotation.y = (p.rot || 0) * DEG;
          g.position.copy(P(p)); G.add(g); break;
        }
        case 'lift': {
          const a = p.att;
          const pivot = new T.Group();
          pivot.position.set(a.x * MM, a.z * MM, -a.y * MM);
          const arm = new T.Group();
          const L2 = a.length * MM, W2 = a.width * MM;
          for (const s of [1, -1]) { const b = beam(L2, '#f4f6f7'); b.position.set(L2 / 2, 0, s * (W2 / 2 - 0.004)); arm.add(b); }
          const tip = beam(W2, '#e8407a', 0.0078, 0.0078, 'z'); tip.position.set(L2 - 0.004, 0, 0); arm.add(tip);
          const hook = box(0.02, 0.004, W2 * 0.6, mat('#e8407a')); hook.position.set(L2 + 0.006, 0.003, 0); arm.add(hook);
          const axle = cyl(0.003, W2 + 0.02, gray, 10); axle.rotation.x = Math.PI / 2; arm.add(axle);
          pivot.add(arm);
          G.add(pivot); R.lifts.push({ pivot, arm });
          break;
        }
        case 'sweep': {
          const a = p.att;
          const pivot = new T.Group();
          pivot.position.set(a.x * MM, a.z * MM, -a.y * MM);
          const arm = new T.Group();
          const bb = beam(a.length * MM, '#e8407a'); bb.position.x = a.length * MM / 2; arm.add(bb);
          const tip = box(0.012, 0.03, 0.012, mat('#e8407a')); tip.position.set(a.length * MM - 0.006, -0.008, 0); arm.add(tip);
          pivot.add(arm);
          G.add(pivot); R.sweeps.push({ pivot, arm, start: (a.start || 0) * DEG });
          break;
        }
        case 'beam': {
          const b = p.w >= p.d ? beam(p.w * MM, p.coll ? '#1f8f9e' : '#f4f6f7', 0.0078, p.h * MM) : beam(p.d * MM, p.coll ? '#1f8f9e' : '#f4f6f7', 0.0078, p.h * MM, 'z');
          b.position.copy(P(p)); G.add(b); break;
        }
        case 'ballast': {
          const b = box(p.w * MM, p.h * MM, p.d * MM, mat('#6b7580', { metalness: 0.6, roughness: 0.4 })); b.position.copy(P(p)); G.add(b); break;
        }
      }
    }
    this.scene.add(G);
    this.robot = R;
    this._updateSpots(cfg);
    if (this.lastFrame) this.update(this.lastFrame);
  }

  _updateSpots(cfg) {
    this.spots.clear(); this.rays.clear();
    this.spotMap = {}; this.rayMap = {};
    for (const d of cfg.devices) {
      if (d.kind === 'color') {
        const m = new T.Mesh(new T.RingGeometry(0.006, 0.0095, 24), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }));
        m.rotation.x = -Math.PI / 2; m.renderOrder = 5; this.spots.add(m); this.spotMap[d.port] = { m, d };
      } else if (d.kind === 'distance') {
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
        const l = new T.Line(g, new T.LineBasicMaterial({ color: '#ff4d6d', transparent: true, opacity: 0.8 }));
        l.frustumCulled = false; this.rays.add(l); this.rayMap[d.port] = { l, d };
      }
    }
  }

  // ------------------------------------------------------------ objetos
  setObjects(defs) {
    for (const [, o] of this.objects) { this.scene.remove(o.g); disposeTree(o.g); }
    this.objects.clear();
    for (const d of defs) this.addObject(d);
  }
  addObject(d) {
    const t = OBJ_TYPES[d.type]; if (!t) return;
    const color = d.color || t.color;
    const m = mat(color, { roughness: 0.5 });
    const g = new T.Group();
    const parts = {};
    const h = (d.h ?? t.h ?? 50) * MM;
    const studs = (w, dd, y) => {
      const nx = Math.max(1, Math.round(w / 0.008) - 1), nz = Math.max(1, Math.round(dd / 0.008) - 1);
      if (nx * nz > 80) return;
      const sg = new T.CylinderGeometry(0.0024, 0.0024, 0.0017, 12);
      const im = new T.InstancedMesh(sg, m, nx * nz);
      const M = new T.Matrix4(); let k = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { M.makeTranslation(-w / 2 + (i + 1) * w / (nx + 1), y + 0.0008, -dd / 2 + (j + 1) * dd / (nz + 1)); im.setMatrixAt(k++, M); }
      im.castShadow = true; g.add(im);
    };
    switch (d.type) {
      case 'caixa': case 'torre': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        if (d.type === 'torre') {
          const n = Math.max(2, Math.round(h / 0.0096 / 3));
          for (let i = 0; i < n; i++) { const b = box(w, h / n - 0.0005, dd, i % 2 ? m : mat('#d9dee3')); b.position.y = (i + 0.5) * h / n; g.add(b); }
        } else { const b = box(w, h, dd, m); b.position.y = h / 2; g.add(b); }
        studs(w, dd, h);
        break;
      }
      case 'cesta': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM, hz = (d.handle ?? t.handle) * MM;
        const b = box(w, h, dd, m); b.position.y = h / 2; g.add(b);
        const inner = box(w * 0.8, 0.002, dd * 0.8, mat('#2b2140')); inner.position.y = h + 0.0005; g.add(inner);
        const hm = mat('#ffcf33');
        for (const s of [1, -1]) { const p = box(0.006, hz - h, 0.006, hm); p.position.set(0, h + (hz - h) / 2, s * dd * 0.38); g.add(p); }
        const bar = box(0.006, 0.006, dd * 0.82, hm); bar.position.set(0, hz, 0); g.add(bar);
        break;
      }
      case 'cilindro': {
        const r = (d.r ?? t.r) * MM; const c = cyl(r, h, m, 28); c.position.y = h / 2; g.add(c);
        const top = cyl(r * 0.55, 0.003, m, 20); top.position.y = h + 0.0015; g.add(top);
        break;
      }
      case 'bola': {
        const r = (d.r ?? t.r) * MM;
        const s = new T.Mesh(new T.SphereGeometry(r, 24, 16), mat(color, { roughness: 0.35 })); s.position.y = r; s.castShadow = true; g.add(s);
        parts.ball = s; break;
      }
      case 'parede': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const b = box(w, h, dd, mat(color, { roughness: 0.7 })); b.position.y = h / 2; g.add(b); studs(w, dd, h); break;
      }
      case 'alavanca': {
        const L = (d.len ?? t.len) * MM;
        const base = cyl(0.018, h + 0.01, mat('#2a3440'), 20); base.position.y = (h + 0.01) / 2; g.add(base);
        const bar = new T.Group();
        const bb = box(L, h - 0.012, 0.016, m); bb.position.set(L / 2, 0.012 + (h - 0.012) / 2, 0); bar.add(bb);
        const knob = cyl(0.012, 0.02, mat('#ffffff'), 16); knob.position.set(L - 0.01, h + 0.01, 0); bar.add(knob);
        g.add(bar); parts.bar = bar; break;
      }
      case 'empurrador': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM, tr = (d.travel ?? t.travel) * MM;
        const rail = new T.Group();
        for (const s of [1, -1]) { const r = box(tr + w, 0.006, 0.008, mat('#3a4652')); r.position.set(tr / 2, 0.003, s * (dd / 2 + 0.006)); rail.add(r); }
        const stop = box(0.01, 0.03, dd + 0.03, mat('#3a4652')); stop.position.set(tr + w / 2 + 0.006, 0.015, 0); rail.add(stop);
        g.add(rail); parts.rail = rail;
        const blk = new T.Group(); const b = box(w, h, dd, m); b.position.y = h / 2; blk.add(b);
        const arrow = box(w * 0.5, 0.002, 0.006, mat('#ffffff')); arrow.position.set(0, h + 0.001, 0); blk.add(arrow);
        g.add(blk); parts.blk = blk; break;
      }
      case 'botao': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const base = box(w, h - 0.008, dd, mat('#3a4652')); base.position.y = (h - 0.008) / 2; g.add(base);
        const plate = box(w * 0.8, 0.008, dd * 0.8, m); plate.position.y = h - 0.004; g.add(plate); parts.plate = plate; parts.h = h;
        break;
      }
      case 'bandeira': {
        const w = (d.w ?? t.w) * MM, dd = (d.d ?? t.d) * MM;
        const base = box(w, h, dd, mat('#3a4652')); base.position.y = h / 2; g.add(base);
        const pole = cyl(0.003, 0.14, mat('#d0d6db', { metalness: 0.6 }), 10); pole.position.set(0, h + 0.07, 0); g.add(pole);
        const fg = new T.Group(); fg.position.set(0, h + 0.005, 0);
        const flag = new T.Mesh(new T.PlaneGeometry(0.06, 0.04), mat(color, { side: T.DoubleSide })); flag.position.set(0.03, 0.02, 0); fg.add(flag);
        g.add(fg); parts.flag = fg;
        const lever = box(0.03 + w / 2, 0.006, 0.012, mat('#ffcf33')); lever.position.set((0.03 + w / 2) / 2, 0.03, 0); g.add(lever); parts.lever = lever;
        break;
      }
      case 'marcador': {
        const r = (d.r ?? t.r) * MM;
        const ring = new T.Mesh(new T.RingGeometry(r * 0.82, r, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0015; g.add(ring); parts.ring = ring;
        break;
      }
    }
    g.position.set(d.x * MM, 0, -d.y * MM);
    g.rotation.y = (d.a || 0) * DEG;
    this.scene.add(g);
    this.objects.set(d.id, { g, d, parts });
  }

  // ------------------------------------------------------------ quadro
  update(f) {
    this.lastFrame = f;
    const R = this.robot;
    if (R && f.robot) {
      const r = f.robot;
      R.group.position.set(r.x * MM, r.grounded === false ? 0.03 : 0, -r.y * MM);
      R.group.rotation.y = r.a;
      R.wheels.forEach((w, i) => { w.g.rotation.z = -(r.wheels[i] || 0); });
      R.lifts.forEach((l, i) => { l.pivot.rotation.z = r.lifts[i] || 0; });
      R.sweeps.forEach((s, i) => { s.pivot.rotation.y = r.sweeps[i] || 0; });
      // trilha
      if (this.flags.trail) {
        const p = [r.x * MM, 0.0012, -r.y * MM];
        const lp = this.trailLast;
        if (lp && Math.hypot(p[0] - lp[0], p[2] - lp[2]) > 0.08) this.clearTrail();
        if (!this.trailLast || Math.hypot(p[0] - this.trailLast[0], p[2] - this.trailLast[2]) > 0.004) {
          const arr = this.trail.geometry.attributes.position.array;
          if (this.trailN >= this.trailMax) { arr.copyWithin(0, 3); this.trailN--; }
          arr.set(p, this.trailN * 3); this.trailN++;
          this.trail.geometry.attributes.position.needsUpdate = true;
          this.trail.geometry.setDrawRange(0, this.trailN);
          this.trailLast = p;
        }
      }
      this.trail.visible = this.flags.trail;
    }
    // hub: matriz e luzes
    if (R && R.hubMx && f.hub) {
      const key = f.hub.matrix.map(v => v | 0).join(',');
      if (key !== R.hubMx.last) {
        R.hubMx.last = key;
        const g = R.hubMx.c.getContext('2d');
        g.fillStyle = '#15191d'; g.fillRect(0, 0, 80, 80);
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
          const v = f.hub.matrix[y * 5 + x] / 100;
          g.fillStyle = v > 0.02 ? `rgba(255,255,255,${0.25 + 0.75 * v})` : '#262c31';
          g.fillRect(6 + x * 14.5, 6 + y * 14.5, 10, 10);
        }
        R.hubMx.tex.needsUpdate = true;
      }
      R.center.material.color.set(lightHex(f.hub.power));
      R.bt.material.color.set(lightHex(f.hub.connect));
    }
    // sensores
    if (R && f.ports) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (let i = 0; i < 6; i++) {
        const pi = f.ports[i]; const L = letters[i];
        if (!pi) continue;
        if (pi.k === 'color' && this.spotMap && this.spotMap[L]) {
          const { m, d } = this.spotMap[L];
          const wp = this.robotToWorld(f.robot, d.x, d.y);
          m.position.set(wp[0], 0.0016, wp[1]);
          m.material.color.set(pi.color >= 0 ? lightHex(pi.color) : '#555');
          m.visible = this.flags.sensors;
        }
        if (pi.k === 'distance' && this.rayMap && this.rayMap[L]) {
          const { l, d } = this.rayMap[L];
          const a = f.robot.a + (d.dir || 0) * DEG;
          const sx = d.x + Math.cos((d.dir || 0) * DEG) * 12, sy = d.y + Math.sin((d.dir || 0) * DEG) * 12;
          const wp = this.robotToWorld(f.robot, sx, sy);
          const dist = pi.mm > 0 ? pi.mm : 250;
          const arr = l.geometry.attributes.position.array;
          arr[0] = wp[0]; arr[1] = d.z * MM; arr[2] = wp[1];
          arr[3] = wp[0] + Math.cos(a) * dist * MM; arr[4] = d.z * MM; arr[5] = wp[1] - Math.sin(a) * dist * MM;
          l.geometry.attributes.position.needsUpdate = true;
          l.material.color.set(pi.mm > 0 ? '#ff4d6d' : '#3c4d5e');
          l.material.opacity = pi.mm > 0 ? 0.85 : 0.35;
          l.visible = this.flags.sensors;
          const eyes = R.distEyes[L];
          if (eyes) eyes.forEach((e, k) => { const v = ((pi.lights && (pi.lights[k * 2] + pi.lights[k * 2 + 1]) / 2) || 0) / 100; e.material.color.setRGB(0.13 + v * 0.87, 0.16 + v * 0.84, 0.19 + v * 0.8); });
        }
      }
    }
    // objetos
    if (f.objs) for (const o of f.objs) {
      const V = this.objects.get(o.id); if (!V) continue;
      const d = V.d;
      if (d.type === 'alavanca') { if (V.parts.bar) V.parts.bar.rotation.y = o.ang || 0; }
      else if (d.type === 'empurrador') { if (V.parts.blk) V.parts.blk.position.x = (o.pos || 0) * MM; }
      else if (d.type === 'botao') { if (V.parts.plate) V.parts.plate.position.y = V.parts.h - 0.004 - (o.done ? 0.004 : o.state * 0.003); }
      else if (d.type === 'bandeira') { if (V.parts.flag) V.parts.flag.rotation.z = 0; if (V.parts.flag) V.parts.flag.position.y = (d.h ?? 50) * MM + (o.done ? 0.1 : 0.005); }
      else if (d.type === 'marcador') { if (V.parts.ring) V.parts.ring.material.color.set(o.done ? '#4dff91' : (d.color || '#37d5ff')); }
      else if (o.x !== undefined) {
        V.g.position.set(o.x * MM, (o.z || 0) * MM, -o.y * MM);
        V.g.rotation.y = o.a;
        if (V.parts.ball) { V.parts.ball.rotation.x = -o.y * MM / 0.02; V.parts.ball.rotation.z = -o.x * MM / 0.02; }
      }
    }
  }

  robotToWorld(r, lx, ly) {
    // mm no referencial do robô -> (X, Z) da cena
    const c = Math.cos(r.a), s = Math.sin(r.a);
    const x = r.x + c * lx - s * ly, y = r.y + s * lx + c * ly;
    return [x * MM, -y * MM];
  }

  // ------------------------------------------------------------ câmera
  setMode(m) {
    this.mode = m;
    const c = this.controls;
    c.enabled = true; c.enableRotate = true;
    if (m === 'top') {
      c.enableRotate = false;
      this.camera.position.set(this.center.x, 2.35, this.center.z + 0.0001);
      this.camera.up.set(0, 1, 0);
      c.target.copy(this.center);
    } else if (m === 'orbit') {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(this.center.x, 1.55, this.center.z + 1.9);
      c.target.copy(this.center);
    } else if (m === 'follow' || m === 'robot') {
      c.enabled = m === 'follow';
    }
    c.update();
  }

  _followCam(dt) {
    const f = this.lastFrame; if (!f || !f.robot) return;
    const r = f.robot;
    const px = r.x * MM, pz = -r.y * MM;
    const fx = Math.cos(r.a), fz = -Math.sin(r.a);
    if (this.mode === 'follow') {
      const want = new T.Vector3(px - fx * 0.36, 0.42, pz - fz * 0.36);
      const k = 1 - Math.exp(-dt * 5);
      const off = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.lerp(new T.Vector3(px + fx * 0.1, 0.03, pz + fz * 0.1), k);
      if (off.length() < 0.05 || this._followInit !== true) { this.camera.position.copy(want); this._followInit = true; }
      else this.camera.position.lerp(this.controls.target.clone().add(off), 1);
      this.camera.position.lerp(want, k * 0.35);
    } else if (this.mode === 'robot') {
      this.camera.position.set(px + fx * 0.02, 0.2, pz + fz * 0.02);
      this.camera.lookAt(px + fx * 0.6, 0.0, pz + fz * 0.6);
    }
  }

  // ------------------------------------------------------------ ponteiro
  toMat(clientX, clientY, planeY = 0) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1, ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const rc = this._rc || (this._rc = new T.Raycaster());
    rc.setFromCamera(new T.Vector2(nx, ny), this.camera);
    const pl = new T.Plane(new T.Vector3(0, 1, 0), -planeY);
    const hit = new T.Vector3();
    if (!rc.ray.intersectPlane(pl, hit)) return null;
    return { x: hit.x / MM, y: -hit.z / MM };
  }

  _bindPointer() {
    const c = this.canvas;
    let dragging = false;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = this.toMat(e.clientX, e.clientY);
      if (!p) return;
      if (this.h.down && this.h.down(p, e)) {
        dragging = true; c.setPointerCapture(e.pointerId);
        e.stopImmediatePropagation(); e.preventDefault();
      }
    }, { capture: true });
    c.addEventListener('pointermove', (e) => {
      const p = this.toMat(e.clientX, e.clientY);
      if (dragging) { if (p && this.h.move) this.h.move(p, e); e.stopImmediatePropagation(); return; }
      if (this.h.hover) this.h.hover(p, e);
    }, { capture: true });
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      const p = this.toMat(e.clientX, e.clientY);
      if (this.h.up) this.h.up(p, e);
      e.stopImmediatePropagation();
    };
    c.addEventListener('pointerup', up, { capture: true });
    c.addEventListener('pointercancel', up, { capture: true });
    c.addEventListener('dblclick', (e) => { const p = this.toMat(e.clientX, e.clientY); if (p && this.h.dbl) this.h.dbl(p, e); });
  }

  setCursor(p, color, r = 10) {
    if (!p) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    this.cursor.position.set(p.x * MM, 0.002, -p.y * MM);
    this.cursor.scale.setScalar(r / 10);
    this.cursor.material.color.set(color || '#37d5ff');
  }

  // pré-visualização simples (linha/retângulo) em mm
  setPreview(shape) {
    this.preview.clear();
    if (!shape) return;
    const col = shape.color || '#37d5ff';
    if (shape.kind === 'poly') {
      const pts = shape.pts.map(([x, y]) => new T.Vector3(x * MM, 0.0025, -y * MM));
      if (shape.closed && pts.length) pts.push(pts[0].clone());
      const g = new T.BufferGeometry().setFromPoints(pts);
      const l = new T.Line(g, new T.LineBasicMaterial({ color: col, depthTest: false }));
      l.renderOrder = 11; this.preview.add(l);
    }
  }

  showSelection(b) {
    if (!b) { this.selBox.visible = false; return; }
    this.selBox.visible = true;
    this.selBox.position.set((b.x0 + b.x1) / 2 * MM, (b.h || 10) / 2 * MM, -(b.y0 + b.y1) / 2 * MM);
    this.selBox.scale.set(Math.max(0.01, (b.x1 - b.x0) * MM), Math.max(0.005, (b.h || 10) * MM), Math.max(0.01, (b.y1 - b.y0) * MM));
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  _loop(t) {
    const dt = Math.min(0.05, (t - (this._lt || t)) / 1000); this._lt = t;
    if (this.mode === 'follow' || this.mode === 'robot') this._followCam(dt);
    if (this.mode !== 'robot') this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}

function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry) x.geometry.dispose();
    if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; ms.forEach(m => { if (m.map && m.map !== _beamTex) m.map.dispose(); m.dispose(); }); }
  });
}
export { objRadius };
