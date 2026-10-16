// three.js geometry for every part, in its own local frame (mm, y up).
import * as THREE from 'three';
import { trayGeometry, hubGeometry, nubGeometry, WASHER, NUT, ROD_D } from './model.js';

const SEG = 128;

export function lathe(profile, segments = SEG) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, segments);
}

// Top-down planar UVs: flat-sawn grain running across the tray.
function planarUV(geo, span) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / span + 0.5, pos.getZ(i) / span + 0.5);
  uv.needsUpdate = true;
  return geo;
}

// Around-and-up UVs: grain along the axis, as for spindle-turned parts.
function spindleUV(geo, len) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    uv.setXY(i, (a / (2 * Math.PI) + 0.5) * 2, pos.getY(i) / len);
  }
  uv.needsUpdate = true;
  return geo;
}

const ring = (rIn, rOut, h) => lathe([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h]], 64);

function nut() {
  const hexR = NUT.s / Math.sqrt(3);
  const hexH = NUT.h * 0.55;
  const hex = new THREE.CylinderGeometry(hexR, hexR, hexH, 6, 1);
  hex.rotateY(Math.PI / 6);
  hex.translate(0, NUT.h - hexH / 2, 0);
  const domeR = NUT.s * 0.47;
  const domeH = NUT.h - hexH;
  const dome = new THREE.SphereGeometry(domeR, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  dome.scale(1, domeH / domeR, 1);
  dome.translate(0, domeH, 0);
  return mergeSimple([hex.toNonIndexed(), dome.toNonIndexed()]);
}

function mergeSimple(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

function plate(p) {
  const R = p.plateD / 2, h = p.plateT;
  return lathe([[ROD_D / 2, 0], [R - 2, 0], [R, 2], [R, h], [ROD_D / 2, h]], 96);
}

// All parts with their geometry (local frame) and material kind.
export function partGeometries(p, L) {
  const tray = trayGeometry(p), hub = hubGeometry(p), nubG = nubGeometry(p);
  const tubeIn = p.tubeD / 2 - 0.8;
  const parts = {
    tray: { geo: planarUV(lathe(tray.profile, 192), 700), kind: 'oak' },
    hub: { geo: spindleUV(lathe(hub.profile), 160), kind: 'oak' },
    nub: { geo: spindleUV(lathe(nubG.profile), 160), kind: 'oak' },
    washerTop: { geo: ring(WASHER.hole / 2, WASHER.d / 2, WASHER.t), kind: 'brass' },
    washerLow: { geo: ring(WASHER.hole / 2, WASHER.d / 2, WASHER.t), kind: 'brass' },
    nut: { geo: nut(), kind: 'brass' },
    rod: { geo: new THREE.CylinderGeometry(ROD_D / 2, ROD_D / 2, L.rodLen, 32).translate(0, L.rodLen / 2, 0), kind: 'steel' },
    tube: { geo: ring(tubeIn, p.tubeD / 2, p.tubeL), kind: 'brass' },
    plate: { geo: plate(p), kind: 'brass' },
  };
  return parts;
}
