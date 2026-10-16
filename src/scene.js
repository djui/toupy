import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WebGLPathTracer, ProceduralEquirectTexture } from 'three-gpu-pathtracer';
import oakSheet from '../assets/oak-sheet.webp';
import { partGeometries } from './parts3d.js';
import { WASHER, NUT } from './model.js';

// Photo of the real oak sheet (600 × 800 mm), bundled so the page also works
// when opened from disk.
function oakTexture(onLoad) {
  const t = new THREE.TextureLoader().load(oakSheet, onLoad);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A photo-studio environment: dim warm walls, a big key softbox, a smaller
// fill on the other side and a strip light overhead. The brass mirrors these.
function studioEnvironment() {
  const tex = new ProceduralEquirectTexture(1024, 512);
  const dir = new THREE.Vector3();
  const boxes = [
    { az: 0.7, el: 0.55, w: 0.55, h: 0.35, i: 9 },     // key
    { az: -2.2, el: 0.35, w: 0.45, h: 0.3, i: 2.5 },   // fill
    { az: 2.6, el: 0.25, w: 0.25, h: 0.5, i: 3 },      // rim
    { az: 0, el: 1.35, w: 3.2, h: 0.12, i: 4 },        // overhead strip
  ];
  tex.generationCallback = (polar, uv, coord, color) => {
    dir.setFromSpherical(polar);
    const el = Math.asin(dir.y), az = Math.atan2(dir.x, dir.z);
    const t = dir.y * 0.5 + 0.5;
    color.setRGB(0.36 + 0.5 * t, 0.34 + 0.48 * t, 0.31 + 0.44 * t);
    for (const b of boxes) {
      const da = Math.abs(((az - b.az + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
      const soft = Math.max(0, 1 - Math.max(da / b.w, Math.abs(el - b.el) / b.h)) ;
      if (soft > 0) { const k = b.i * Math.min(1, soft * 6); color.r += k; color.g += k * 0.98; color.b += k * 0.94; }
    }
  };
  tex.update();
  return tex;
}

export class Viewer {
  constructor(el, { onHover, onSamples } = {}) {
    this.el = el;
    this.onHover = onHover;
    this.onSamples = onSamples;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the oak photo's colours true
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment();
    this.scene.environmentIntensity = 0.55;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    // Ray-traced, the background matches the lit floor, so there's no horizon.
    const bg = () => {
      this.scene.background = new THREE.Color(this.rt ? (dark.matches ? 0x34302b : 0xeeedeb) : (dark.matches ? 0x2a2622 : 0xebe6de));
      this.floor.material.color.set(dark.matches ? 0x3a3530 : 0xd9d8d6);
      if (this.pt?.scene) { this.pt.updateEnvironment(); this.pt.updateMaterials(); }
    };

    this.camera = new THREE.PerspectiveCamera(35, 1, 20, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(800, 3000, 1200);
    this.scene.add(sun);

    const grain = oakTexture(() => { if (this.pt?.scene) this.pt.updateMaterials(); });
    this.mats = {
      // The photo came out cooler than the wood looks; warm it towards honey brown.
      oak: new THREE.MeshStandardMaterial({ map: grain, color: 0xfbe9d4, roughness: 0.6, metalness: 0 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xe3b866, metalness: 1, roughness: 0.16 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.35 }),
    };
    // Cut faces: end grain is a little darker and duller than the face.
    this.caps = {
      oak: new THREE.MeshStandardMaterial({ color: 0xa07f5d, roughness: 0.85 }),
      brass: this.mats.brass,
      steel: this.mats.steel,
    };
    this.hoverMat = new THREE.MeshStandardMaterial({ color: 0x5aa0ff, roughness: 0.5, emissive: 0x16365c });

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.grid = new THREE.GridHelper(2000, 20, 0xbbbbbb, 0xdddddd);
    this.scene.add(this.grid);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.visible = false;
    this.scene.add(this.floor);
    this.ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.ceiling.rotation.x = Math.PI / 2;
    this.scene.add(this.ceiling);
    this.bg = bg;
    bg(); dark.addEventListener('change', bg);

    this.explode = 0;
    this.cut = false;
    this.rt = false;
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
    const loop = () => {
      const moved = this.controls.update();
      this.pick();
      this.render(moved);
      requestAnimationFrame(loop);
    };
    loop();
  }

  render(moved) {
    if (!this.rt) { this.renderer.render(this.scene, this.camera); return; }
    // Rebuilding the ray tracer's scene takes a moment, so wait until the
    // sliders settle; draw the normal view meanwhile.
    if (this.dirtyAt && performance.now() - this.dirtyAt > 150) {
      this.dirtyAt = 0;
      this.pt.setScene(this.scene, this.camera);
    } else if (moved) {
      this.pt.updateCamera();
    }
    if (this.dirtyAt) { this.renderer.render(this.scene, this.camera); return; }
    this.pt.renderSample();
    this.onSamples?.(Math.floor(this.pt.samples));
  }

  setRayTraced(on) {
    if (on && !this.pt) {
      this.pt = new WebGLPathTracer(this.renderer);
      this.pt.tiles.set(2, 2);
      this.pt.textureSize.set(2048, 2048);
      this.pt.bounces = 6;
      this.pt.filterGlossyFactor = 0.4;
      this.pt.minSamples = 2;
      this.pt.renderDelay = 80;
      this.pt.fadeDuration = 250;
      this.pt.dynamicLowRes = true;
      this.pt.lowResScale = 0.35;
    }
    this.rt = on;
    this.grid.visible = this.ceiling.visible = !on;
    this.floor.visible = on;
    this.bg();
    if (this.hovered) { this.hovered.material = this.matFor(this.hovered); this.hovered = null; }
    if (on) this.dirtyAt = 1;
    else this.onSamples?.(null);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.rt) this.pt.updateCamera();
  }

  matFor(mesh) { return mesh.userData.cap ? this.caps[mesh.userData.kind] : this.mats[mesh.userData.kind]; }

  build(p, L, info) {
    for (const it of this.items) it.group.traverse(o => o.geometry?.dispose());
    this.root.clear();
    this.items = [];
    this.hovered = null;
    this.args = [p, L, info];
    const geos = partGeometries(p, L, this.cut);
    // Parts that sit flush on the tray (hub foot on the dish floor, tenons in
    // their recesses) share surfaces, which the GPU can't order and draws as
    // flickering lines. In the view only, they get a hair of clearance.
    const CLEAR = 0.3;
    const clearance = { hub: [CLEAR, 1 - CLEAR / p.tenonD], nub: [-CLEAR, 1 - CLEAR / p.nubTenonD] };
    const add = (id, geoKey, y, explodeDir, label) => {
      const { geo, cap, kind } = geos[geoKey];
      const g = new THREE.Group();
      const meshes = [new THREE.Mesh(geo, this.mats[kind])];
      if (cap) meshes.push(new THREE.Mesh(cap, this.caps[kind]));
      const c = clearance[id];
      for (const [i, m] of meshes.entries()) {
        m.userData = { id, label, kind, cap: i > 0 };
        if (c) { m.position.y = c[0]; m.scale.set(c[1], 1, c[1]); }
        g.add(m);
      }
      this.root.add(g);
      this.items.push({ id, group: g, meshes, y, explodeDir, kind });
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
    if (this.rt) this.dirtyAt = performance.now();
  }

  setExplode(e) { this.explode = e; this.applyExplode(); }
  setCut(on) { this.cut = on; if (this.args) this.build(...this.args); }

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
    if (this.rt) this.pt.updateCamera();
  }

  pick() {
    if (!this.needPick) return;
    this.needPick = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.items.flatMap(i => i.meshes), false)[0];
    const mesh = hit ? hit.object : null;
    // In ray-traced mode a highlight would restart the render, so only the
    // tooltip shows.
    if (!this.rt && mesh !== this.hovered) {
      if (this.hovered) this.hovered.material = this.matFor(this.hovered);
      this.hovered = mesh;
      if (mesh) mesh.material = this.hoverMat;
    }
    this.onHover?.(mesh ? mesh.userData : null, this.pointerPx);
  }

  snapshot() { return this.renderer.domElement.toDataURL('image/png'); }
}

export { WASHER, NUT };
