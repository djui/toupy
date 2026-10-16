import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { partGeometries } from './parts3d.js';
import { WASHER, NUT } from './model.js';

function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#c99d6b';
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x0 = rnd() * 1024, amp = 2 + rnd() * 10, freq = 1 + rnd() * 3, ph = rnd() * 6.28;
    g.strokeStyle = `rgba(${110 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${35 + rnd() * 20 | 0},${0.05 + rnd() * 0.18})`;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    for (let y = 0; y <= 1024; y += 16) {
      const x = x0 + Math.sin(y / 1024 * Math.PI * 2 * freq + ph) * amp;
      y ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // medullary ray flecks typical of oak
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(235,205,160,${0.08 + rnd() * 0.12})`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 4 + rnd() * 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Viewer {
  constructor(el, { onHover } = {}) {
    this.el = el;
    this.onHover = onHover;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const bg = () => this.renderer.setClearColor(dark.matches ? 0x2a2622 : 0xebe6de);
    bg(); dark.addEventListener('change', bg);
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(35, 1, 20, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(800, 3000, 1200);
    this.scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x9a8f80, 0.5));

    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const clipping = () => (this.cut ? [this.clip] : []);
    const grain = grainTexture();
    this.mats = {
      oak: new THREE.MeshStandardMaterial({ map: grain, roughness: 0.62, metalness: 0 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xe0b85a, metalness: 1, roughness: 0.18 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.35 }),
    };
    const cap = color => new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    this.caps = {
      oak: cap(0x8c5a2b),
      brass: cap(0x9c7a26),
      steel: cap(0x6f6f6f),
    };
    this.hoverMat = new THREE.MeshStandardMaterial({ color: 0x5aa0ff, roughness: 0.5, emissive: 0x16365c });
    for (const m of [...Object.values(this.mats), ...Object.values(this.caps), this.hoverMat]) {
      Object.defineProperty(m, 'clippingPlanes', { get: clipping, set() {}, configurable: true });
    }

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.grid = new THREE.GridHelper(2000, 20, 0xbbbbbb, 0xdddddd);
    this.scene.add(this.grid);
    this.ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.ceiling.rotation.x = Math.PI / 2;
    this.scene.add(this.ceiling);

    this.explode = 0;
    this.cut = false;
    this.items = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(9, 9);
    this.hovered = null;

    this.renderer.domElement.addEventListener('pointermove', e => {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.needPick = true;
    });
    this.renderer.domElement.addEventListener('pointerleave', () => { this.pointer.set(9, 9); this.needPick = true; });

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { this.controls.update(); this.pick(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  build(p, L, info) {
    for (const it of this.items) { it.mesh.geometry.dispose(); }
    this.root.clear();
    this.items = [];
    const geos = partGeometries(p, L);
    // Parts that sit flush on the tray (hub foot on the dish floor, tenons in
    // their recesses) share surfaces, which the GPU can't order and draws as
    // flickering lines. In the view only, they get a hair of clearance.
    const CLEAR = 0.3;
    const clearance = { hub: [CLEAR, 1 - CLEAR / p.tenonD], nub: [-CLEAR, 1 - CLEAR / p.nubTenonD] };
    const add = (id, geoKey, y, explodeDir, label) => {
      const { geo, kind } = geos[geoKey];
      const mesh = new THREE.Mesh(geo, this.mats[kind]);
      const cap = new THREE.Mesh(geo, this.caps[kind]);
      const g = new THREE.Group();
      g.add(mesh, cap);
      const c = clearance[id];
      if (c) { mesh.position.y = cap.position.y = c[0]; mesh.scale.set(c[1], 1, c[1]); cap.scale.copy(mesh.scale); }
      mesh.userData = { id, label, kind };
      this.root.add(g);
      this.items.push({ id, group: g, mesh, y, explodeDir, kind });
    };
    const d = p.hubH; // explode spacing scales with the hub
    add('plate', 'plate', L.plateBottom, [0, 1.0 * d + 40 * p.tubeN, 0], info.plate);
    L.tubes.forEach((t, i) => add('tube' + i, 'tube', t.bottom, [0, 0.9 * d + 40 * i, 0], info.tube));
    add('washerTop', 'washerTop', L.hubTop, [0, 0.75 * d, 0], info.washer);
    add('hub', 'hub', L.dishFloor, [0, 0.45 * d, 0], info.hub);
    add('tray', 'tray', L.trayBottom, [0, 0, 0], info.tray);
    add('nub', 'nub', L.trayBottom, [0, -0.45 * d, 0], info.nub);
    add('washerLow', 'washerLow', L.lowWasherBottom, [0, -0.75 * d, 0], info.washer);
    add('nut', 'nut', L.nutBottom, [0, -1.0 * d, 0], info.nut);
    add('rod', 'rod', L.rodBottom, [p.trayD / 2 + 80, 0, 0], info.rod);
    this.ceiling.position.y = p.ceilingH;
    this.L = L; this.p = p;
    this.applyExplode();
    if (!this.framed) { this.frame('table'); this.framed = true; }
  }

  applyExplode() {
    const e = this.explode;
    for (const it of this.items) {
      it.group.position.set(it.explodeDir[0] * e, it.y + it.explodeDir[1] * e, it.explodeDir[2] * e);
    }
  }

  setExplode(e) { this.explode = e; this.applyExplode(); }
  setCut(on) { this.cut = on; for (const m of [...Object.values(this.mats), ...Object.values(this.caps), this.hoverMat]) m.needsUpdate = true; }

  frame(which) {
    const L = this.L, p = this.p;
    if (which === 'whole') {
      this.controls.target.set(0, p.ceilingH / 2, 0);
      this.camera.position.set(2600, p.ceilingH * 0.75, 3600);
    } else {
      const y = (L.trayTop + L.nubBottom) / 2 + 30;
      this.controls.target.set(0, y, 0);
      const r = p.trayD;
      this.camera.position.set(r * 1.1, y + r * 0.9, r * 1.9);
    }
    this.controls.update();
  }

  pick() {
    if (!this.needPick) return;
    this.needPick = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.items.map(i => i.mesh), false);
    const hit = hits.find(h => !this.cut || this.clip.distanceToPoint(h.point) >= 0);
    const mesh = hit ? hit.object : null;
    if (mesh !== this.hovered) {
      if (this.hovered) this.hovered.material = this.mats[this.hovered.userData.kind];
      this.hovered = mesh;
      if (mesh) mesh.material = this.hoverMat;
    }
    this.onHover?.(mesh ? mesh.userData : null, this.pointerPx);
  }

  snapshot() { return this.renderer.domElement.toDataURL('image/png'); }
}

export { WASHER, NUT };
