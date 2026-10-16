// The entrance area the table will hang in, modelled after a photo of the
// flat (no photo is used): a wall with the front door and the intercom
// right behind the table, a step back to the next wall, with the electrical
// cabinet on the step and a gold-framed mirror, tall white cupboards on the right, a
// light wood floor. Millimetres, table axis at x = z = 0, viewer on +z.
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

export function buildRoom(p, oakTexture) {
  const g = new THREE.Group();
  const H = p.ceilingH;
  const R = p.trayD / 2;

  // All walls are one muted mint green; the photo's grey vs yellow is light.
  const paint = std(0xb5c0ac, 0.9);
  const taupe = paint, beige = paint;
  const white = std(0xf1eee8, 0.6);
  const ceilingMat = std(0xf6f4f0, 0.95);
  const frameBlack = std(0x1f1c1a, 0.5);
  const doorMat = std(0x4a221f, 0.35);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.2 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.35 });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 });

  // Plan: the door wall sits a few centimetres behind the tray; right of the
  // table the wall steps back to the beige wall; cupboards close the right.
  const zDoor = -(R + 60);
  const step = 600;
  const zBack = zDoor - step;
  const xCorner = 60;
  const xLeft = -2700, xRight = 2700, zFront = 6500;

  // floor: light oak planks, from the sheet photo, greyed and repeated
  const floorTex = oakTexture.clone();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.needsUpdate = true;
  const floorGeo = new THREE.PlaneGeometry(xRight - xLeft, zFront - zBack);
  const uv = floorGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (xRight - xLeft) / 600, uv.getY(i) * (zFront - zBack) / 800);
  const floor = new THREE.Mesh(floorGeo, std(0xd9cdbd, 0.45, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((xLeft + xRight) / 2, 0, (zBack + zFront) / 2);
  g.add(floor);

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
  const doorW = 900, doorH = 2100, doorX = -1250, fw = 70;
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
