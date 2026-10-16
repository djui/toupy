// three.js geometry for every part, in its own local frame (mm, y up).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trayGeometry, hubGeometry, nubGeometry, WASHER, NUT, ROD_D } from './model.js';

const SEG = 128;

export function lathe(profile, segments = SEG) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, segments);
}

// The back half of a lathe part (z ≤ 0), for the cut-away view.
function latheHalf(profile, segments = SEG) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, Math.max(1, segments / 2), Math.PI / 2, Math.PI);
}

// The flat cut face where the half lathe is open: the profile and its mirror,
// in the z = 0 plane, facing the viewer (+z).
function cutFace(profile) {
  const shape = sign => new THREE.Shape(profile.map(([r, z]) => new THREE.Vector2(sign * r, z)));
  const geos = [new THREE.ShapeGeometry(shape(1)), new THREE.ShapeGeometry(shape(-1))];
  return mergeGeometries(geos);
}

// A lathe part: whole, or as its back half plus the cut face.
function turned(profile, segments, half) {
  return half ? { geo: latheHalf(profile, segments), cap: cutFace(profile) } : { geo: lathe(profile, segments) };
}

function withUV(part, fn, arg) {
  fn(part.geo, arg);
  return part;
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

const ringProfile = (rIn, rOut, h) => [[rIn, 0], [rOut, 0], [rOut, h], [rIn, h]];

// Acorn nut: a hexagon (a 6-sided lathe) on top of a dome, solid.
function nut(half) {
  const hexR = NUT.s / Math.sqrt(3), hexH = NUT.h * 0.55;
  const domeR = NUT.s * 0.47, domeH = NUT.h - hexH;
  const hex = [[0, domeH], [hexR, domeH], [hexR, NUT.h], [0, NUT.h]];
  const dome = [[0, 0]];
  for (let k = 1; k <= 16; k++) {
    const a = (k / 16) * Math.PI / 2;
    dome.push([domeR * Math.sin(a), domeH * (1 - Math.cos(a))]);
  }
  dome.push([0, domeH]);
  const h = turned(hex, 6, half), d = turned(dome, 48, half);
  return {
    geo: mergeGeometries([h.geo, d.geo]),
    cap: half ? mergeGeometries([h.cap, d.cap]) : undefined,
  };
}

const plateProfile = p => {
  const R = p.plateD / 2, h = p.plateT;
  return [[ROD_D / 2, 0], [R - 2, 0], [R, 2], [R, h], [ROD_D / 2, h]];
};

// All parts with their geometry (local frame) and material kind. With
// half = true each part is cut through its axis: `geo` is the back half and
// `cap` the flat cut face.
export function partGeometries(p, L, half = false) {
  const tray = trayGeometry(p), hub = hubGeometry(p), nubG = nubGeometry(p);
  const tubeIn = p.tubeD / 2 - 0.8;
  const washer = ringProfile(WASHER.hole / 2, WASHER.d / 2, WASHER.t);
  return {
    tray: { ...withUV(turned(tray.profile, 192, half), planarUV, 700), kind: 'oak' },
    hub: { ...withUV(turned(hub.profile, SEG, half), spindleUV, 160), kind: 'oak' },
    nub: { ...withUV(turned(nubG.profile, SEG, half), spindleUV, 160), kind: 'oak' },
    washerTop: { ...turned(washer, 64, half), kind: 'brass' },
    washerLow: { ...turned(washer, 64, half), kind: 'brass' },
    nut: { ...nut(half), kind: 'brass' },
    rod: { ...turned(ringProfile(0, ROD_D / 2, L.rodLen), 32, half), kind: 'steel' },
    tube: { ...turned(ringProfile(tubeIn, p.tubeD / 2, p.tubeL), 64, half), kind: 'brass' },
    plate: { ...turned(plateProfile(p), 96, half), kind: 'brass' },
  };
}
