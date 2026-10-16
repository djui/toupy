import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WebGLPathTracer, ProceduralEquirectTexture } from 'three-gpu-pathtracer';
import oakSheet from '../assets/oak-sheet.webp';
import { partGeometries } from './parts3d.js';
import { WASHER, NUT } from './model.js';
import { buildRoom } from './room.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

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
  constructor(el, { onHover, onSamples, onPause } = {}) {
    this.el = el;
    this.onHover = onHover;
    this.onSamples = onSamples;
    this.onPause = onPause;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the oak photo's colours true
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.studioEnv = studioEnvironment();
    this.scene.environment = this.studioEnv;
    this.scene.environmentIntensity = 0.55;
    this.dark = matchMedia('(prefers-color-scheme: dark)');
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    RectAreaLightUniformsLib.init();

    this.camera = new THREE.PerspectiveCamera(35, 1, 20, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.position.set(800, 3000, 1200);
    this.scene.add(this.sun);

    const grain = oakTexture(() => { if (this.rt) this.dirtyAt = performance.now(); });
    this.oak = grain;
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

    this.explode = 0;
    this.cut = false;
    this.rt = false;
    this.roomOn = false;
    this.look();
    this.dark.addEventListener('change', () => this.look());
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
    // Paused: draw nothing, so the canvas keeps the last image and the GPU
    // rests. Moving the camera or changing the scene picks it up again.
    if (this.paused) {
      if (!moved && !this.dirtyAt) return;
      this.setPaused(false);
    }
    // Rebuilding the ray tracer's scene takes a moment, so wait until the
    // sliders settle; draw the normal view meanwhile.
    if (this.dirtyAt && performance.now() - this.dirtyAt > 150) {
      this.dirtyAt = 0;
      this.pt.setScene(this.scene, this.camera);
    } else if (moved) {
      this.pt.updateCamera();
    }
    if (this.dirtyAt) { this.renderer.render(this.scene, this.camera); this.onSamples?.('preparing'); return; }
    this.pt.renderSample();
    this.onSamples?.(this.pt.isCompiling ? 'compiling' : Math.floor(this.pt.samples));
  }

  setPaused(on) {
    this.paused = on && this.rt;
    this.onPause?.(this.paused);
    if (this.paused) this.onSamples?.(`${Math.floor(this.pt.samples)} samples · paused`);
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
    this.setPaused(false);
    // The orbit's easing keeps nudging the camera for a second after you
    // let go, and every nudge restarts the ray tracer, so it's off here.
    this.controls.enableDamping = !on;
    this.lookKey = null;
    this.look();
    if (this.hovered) { this.hovered.material = this.matFor(this.hovered); this.hovered = null; }
    if (on) this.dirtyAt = 1;
    else this.onSamples?.(null);
  }

  // Background, helpers and environment for the current mode. Ray-traced
  // without the room, the backdrop matches the lit floor so there's no horizon.
  look() {
    const dark = this.dark.matches, room = this.roomOn;
    this.scene.background = new THREE.Color(room ? 0xe9e6e0 : this.rt ? (dark ? 0x34302b : 0xeeedeb) : (dark ? 0x2a2622 : 0xebe6de));
    this.floor.material.color.set(dark ? 0x3a3530 : 0xd9d8d6);
    this.grid.visible = this.ceiling.visible = !this.rt && !room;
    this.floor.visible = this.rt && !room;
    this.sun.visible = !room; // indoors the ceiling light and the open side light the room
    // Normal view in the room: the brass reflects a snapshot of the room.
    // Ray-traced, it reflects the real room, lit through the open side.
    const roomEnv = room && !this.rt && this.roomEnv;
    this.scene.environment = roomEnv || this.studioEnv;
    this.scene.environmentIntensity = roomEnv ? 1 : 0.55;
    // Rebuilding the ray tracer's scene restarts the render, so only when
    // something it sees has changed.
    const key = [dark, room, this.rt, this.scene.environment?.uuid, this.room?.group.uuid].join();
    if (this.rt && key !== this.lookKey) this.dirtyAt = performance.now();
    this.lookKey = key;
  }

  setRoom(on) {
    this.roomOn = on;
    const c = this.controls;
    if (on) {
      this.rebuildRoom();
      // stay inside: in front of the walls, under the ceiling
      c.minAzimuthAngle = -1.25; c.maxAzimuthAngle = 1.25;
      c.maxPolarAngle = 1.8; c.maxDistance = 6000;
    } else {
      this.removeRoom();
      c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity;
      c.maxPolarAngle = Math.PI; c.maxDistance = Infinity;
    }
    this.look();
    this.frame('table');
  }

  removeRoom() {
    if (!this.room) return;
    this.scene.remove(this.room.group);
    this.room.group.traverse(o => { o.geometry?.dispose(); });
    this.room = null;
    this.roomEnv?.dispose?.();
    this.roomEnv = null;
  }

  rebuildRoom() {
    this.removeRoom();
    this.roomCache ??= {};
    this.room = buildRoom(this.p, this.oak, this.roomCache);
    this.scene.add(this.room.group);
    // Snapshot the room from the table for reflections in the normal view.
    if (!this.cubeRT) {
      this.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      this.cubeCam = new THREE.CubeCamera(10, 20000, this.cubeRT);
    }
    const wasRoom = this.roomOn;
    this.roomOn = true; this.look();
    this.cubeCam.position.set(0, this.L.trayTop + 150, 0);
    this.root.visible = false;
    this.cubeCam.update(this.renderer, this.scene);
    this.root.visible = true;
    this.roomEnv = this.pmrem.fromCubemap(this.cubeRT.texture).texture;
    this.roomOn = wasRoom;
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    // any real resize restarts the ray tracer, so skip ones that change nothing
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
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
    if (this.roomOn) { this.rebuildRoom(); this.look(); }
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
    if (this.roomOn) {
      // From the dining table, looking at the entrance, as in the photo.
      const whole = which === 'whole';
      this.controls.target.set(0, whole ? p.ceilingH * 0.45 : L.trayTop - 60, 0);
      this.camera.position.set(whole ? 900 : 380, whole ? 1300 : 1400, whole ? 5600 : 2300);
    } else if (which === 'whole') {
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
