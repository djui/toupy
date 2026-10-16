// The entrance area the table will hang in, modelled after a photo of the
// flat (no photo is used): a wall with the front door and the intercom
// right behind the table, a step back to the next wall, with the electrical
// cabinet on the step and a gold-framed mirror, tall white cupboards on the right, a
// herringbone oak floor. Millimetres, table axis at x = z = 0, viewer on +z.
import * as THREE from 'three';

const std = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// A wall in the x/y plane at depth z, from x0 to x1, facing +z.
function wallZ(x0, x1, z, H, mat) {
  const m = plane(x1 - x0, H, mat);
  m.position.set((x0 + x1) / 2, H / 2, z);
  return m;
}

// A wall in the z/y plane at x, from z0 to z1, facing +x (or -x).
function wallX(z0, z1, x, H, mat, facing = 1) {
  const m = plane(z1 - z0, H, mat);
  m.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, H / 2, (z0 + z1) / 2);
  return m;
}

// Pale oak herringbone: 90 × 450 mm planks at 45°, so the zigzag runs
// toward the viewer. Each plank is cut from a random spot of the sheet photo
// (grain along its length), lightened, with a little brightness variation and
// fine dark joints from the underlay showing between planks.
function herringboneFloor({ xLeft, xRight, zBack, zFront }, oakTexture, cache) {
  const W = 90, L = 450, GAP = 0.6;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Lightened copy of the photo: unfinished oak is paler than the sheet.
  let map = cache.floorMap || oakTexture;
  const img = oakTexture.image;
  if (!cache.floorMap && img && img.complete !== false && img.width) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * img.height / img.width);
    const ctx = c.getContext('2d');
    ctx.filter = 'brightness(1.32) saturate(0.7) contrast(0.88)';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    cache.floorMap = map; // reused, so rebuilding the room doesn't re-upload it
  }

  // Herringbone in a frame turned 45° from the room: H planks on a staircase
  // n·(W, W), V planks against their ends, bands repeating every (L, −L).
  const s2 = Math.SQRT1_2;
  const toRoom = (x, y) => [(x - y) * s2, (x + y) * s2];
  const pos = [], uv = [], col = [], idx = [];
  const add = (x0, y0, w, h, along) => {
    const [cx, cz] = toRoom(x0 + w / 2, y0 + h / 2);
    if (cx < xLeft - L || cx > xRight + L || cz < zBack - L || cz > zFront + L) return;
    const a = x0 + GAP, b = y0 + GAP, c = x0 + w - GAP, d = y0 + h - GAP;
    const base = pos.length / 3;
    for (const [x, y] of [[a, b], [c, b], [c, d], [a, d]]) {
      const [X, Z] = toRoom(x, y);
      pos.push(X, 0, Z);
    }
    const uw = W / 600, lv = L / 800;
    const u0 = rnd() * (1 - uw), v0 = rnd() * (1 - lv);
    if (along === 'x') uv.push(u0, v0, u0, v0 + lv, u0 + uw, v0 + lv, u0 + uw, v0);
    else uv.push(u0, v0, u0 + uw, v0, u0 + uw, v0 + lv, u0, v0 + lv);
    const k = 0.86 + rnd() * 0.2, warm = (rnd() - 0.5) * 0.04;
    for (let i = 0; i < 4; i++) col.push(k + warm, k, k - warm, 1);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const ext = Math.max(xRight - xLeft, zFront - zBack) * 1.6;
  const N = Math.ceil(ext / W), M = Math.ceil(ext / L);
  for (let m = -M; m <= M; m++) for (let n = -N; n <= N; n++) {
    const x0 = n * W + m * L, y0 = n * W - m * L;
    add(x0, y0, L, W, 'x');                 // H plank
    add(x0 + L, y0 + W - L, W, L, 'y');     // V plank against its end
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // RGBA: the path tracer turns 3-channel colours black when it merges meshes
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const planks = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.62 }));

  // dark underlay that shows in the joints
  const under = new THREE.Mesh(new THREE.PlaneGeometry(xRight - xLeft, zFront - zBack), std(0x7d6e5c, 0.9));
  under.rotation.x = -Math.PI / 2;
  under.position.set((xLeft + xRight) / 2, -0.5, (zBack + zFront) / 2);

  const g = new THREE.Group();
  g.add(under, planks);
  return g;
}

export function buildRoom(p, oakTexture, cache = {}) {
  const g = new THREE.Group();
  const H = p.ceilingH;
  const R = p.trayD / 2;

  // All walls are one muted, brownish mint green; the photo's grey vs yellow is light.
  const paint = std(0xb0ad94, 0.9);
  const taupe = paint, beige = paint;
  const white = std(0xf1eee8, 0.6);
  const ceilingMat = std(0xf6f4f0, 0.95);
  const frameBlack = std(0x1f1c1a, 0.5);
  const doorMat = std(0x4a221f, 0.35);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.2 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.35 });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 });

  // Plan: the door wall sits 14 cm behind the tray; right of the
  // table the wall steps back to the beige wall; cupboards close the right.
  const zDoor = -(R + 140);
  const step = 600;
  const zBack = zDoor - step;
  const xCorner = 210;
  const xLeft = -2550, xRight = 2850, zFront = 6500;

  g.add(herringboneFloor({ xLeft, xRight, zBack, zFront }, oakTexture, cache));

  // ceiling, facing down
  const ceil = plane(xRight - xLeft, zFront - zBack, ceilingMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((xLeft + xRight) / 2, H, (zBack + zFront) / 2);
  g.add(ceil);

  // walls
  g.add(wallZ(xLeft, xCorner, zDoor, H, taupe));
  g.add(wallX(zBack, zDoor, xCorner, H, beige, 1));
  g.add(wallZ(xCorner, xRight, zBack, H, beige));

  // skirting boards
  const skirt = 80, skirtD = 12;
  g.add(box(xCorner - xLeft, skirt, skirtD, white, (xLeft + xCorner) / 2, skirt / 2, zDoor + skirtD / 2));
  g.add(box(xRight - xCorner, skirt, skirtD, white, (xCorner + xRight) / 2, skirt / 2, zBack + skirtD / 2));
  g.add(box(skirtD, skirt, step, white, xCorner + skirtD / 2, skirt / 2, (zBack + zDoor) / 2));

  // front door: black frame, dark wine-red leaf, lever handle
  const doorW = 900, doorH = 2100, doorX = -1100, fw = 70;
  g.add(box(doorW + 2 * fw, fw, 30, frameBlack, doorX, doorH + fw / 2, zDoor + 15));
  g.add(box(fw, doorH, 30, frameBlack, doorX - doorW / 2 - fw / 2, doorH / 2, zDoor + 15));
  g.add(box(fw, doorH, 30, frameBlack, doorX + doorW / 2 + fw / 2, doorH / 2, zDoor + 15));
  g.add(box(doorW, doorH, 40, doorMat, doorX, doorH / 2, zDoor + 20));
  const hx = doorX + doorW / 2 - 90;
  g.add(box(30, 120, 12, chrome, hx, 1050, zDoor + 46));
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 130, 16), chrome);
  lever.rotation.z = Math.PI / 2;
  lever.position.set(hx - 55, 1060, zDoor + 70);
  g.add(lever, box(18, 18, 30, chrome, hx, 1060, zDoor + 58));

  // intercom handset, next to the door frame
  const ix = doorX + doorW / 2 + fw + 170, iy = 1450;
  g.add(box(105, 230, 45, std(0xe9e0cc, 0.5), ix, iy, zDoor + 22));
  g.add(box(70, 190, 20, std(0xded3bb, 0.5), ix, iy, zDoor + 55));
  g.add(box(40, 60, 12, std(0xd8ccb2, 0.5), ix, iy - 160, zDoor + 8));

  // white light switches below the intercom: a double plate, two rockers each
  const swMat = std(0xf4f2ee, 0.4), rocker = std(0xfbfaf8, 0.3);
  for (const sy of [1080, 1170]) {
    g.add(box(86, 86, 10, swMat, ix, sy, zDoor + 5));
    g.add(box(34, 56, 6, rocker, ix - 19, sy, zDoor + 12));
    g.add(box(34, 56, 6, rocker, ix + 19, sy, zDoor + 12));
  }

  // electrical cabinet: white, on the short wall of the step, facing right
  const cz = (zDoor + zBack) / 2, cy = 1500, cw = 440, ch = 900;
  g.add(box(25, ch, cw, white, xCorner + 12, cy, cz));
  const seam = std(0xc9c4ba, 0.6);
  g.add(box(4, 4, cw - 30, seam, xCorner + 26, cy + 120, cz));
  g.add(box(4, 4, cw - 30, seam, xCorner + 26, cy - 210, cz));
  g.add(box(4, ch - 30, 4, seam, xCorner + 26, cy, cz - cw / 2 + 40));

  // mirror with a gold frame, right of the cabinet
  const mx = xCorner + 700, my = 1350, mw = 420, mh = 1350, mf = 55;
  g.add(box(mw, mh, 8, mirror, mx, my, zBack + 30));
  g.add(box(mw + 2 * mf, mf, 40, gold, mx, my + mh / 2 + mf / 2, zBack + 25));
  g.add(box(mw + 2 * mf, mf, 40, gold, mx, my - mh / 2 - mf / 2, zBack + 25));
  g.add(box(mf, mh, 40, gold, mx - mw / 2 - mf / 2, my, zBack + 25));
  g.add(box(mf, mh, 40, gold, mx + mw / 2 + mf / 2, my, zBack + 25));

  // tall white cupboards on the right, facing left, with door gaps
  g.add(wallX(zBack, zFront, xRight, H, white, -1));
  for (let z = zBack + 600; z < zFront; z += 600) g.add(box(4, H - 20, 4, seam, xRight - 3, H / 2, z));
  g.add(box(4, 4, zFront - zBack, seam, xRight - 3, 2050, (zBack + zFront) / 2));

  // soft ceiling light over the dining area
  const light = new THREE.RectAreaLight(0xfff0dc, 10, 900, 900);
  light.position.set(-200, H - 2, 1200);
  light.rotation.x = -Math.PI / 2;
  g.add(light);
  const fill = new THREE.PointLight(0xfff0dc, 1.6, 0, 0);
  fill.position.set(0, H - 300, 1500);
  g.add(fill);

  return {
    group: g,
    bounds: { xLeft, xRight, zBack, zFront },
  };
}
