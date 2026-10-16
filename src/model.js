// Pure geometry: 2D half-profiles (r, z) of the turned and routed parts,
// where every part sits in the stack, and derived numbers. No three.js here.
//
// Profiles are closed loops, counter-clockwise in the (r, z) plane, so the
// lathe surfaces face outwards.

export const WASHER = { d: 20, t: 1.5, hole: 10.5 };
export const NUT = { s: 17, h: 18, thread: 13 }; // DIN 1587 M10 acorn nut
export const ROD_D = 10;

const lerp = (a, b, t) => a + (b - a) * t;

// Walk `dist` along a polyline from index i in direction dir (+1/-1).
function walk(pts, i, dir, dist) {
  let left = dist, cur = pts[i];
  for (let j = i + dir; j >= 0 && j < pts.length; j += dir) {
    const nxt = pts[j];
    const seg = Math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]);
    if (seg >= left) {
      const t = left / seg;
      return { pt: [lerp(cur[0], nxt[0], t), lerp(cur[1], nxt[1], t)], idx: j, dir };
    }
    left -= seg; cur = nxt;
  }
  return { pt: cur, idx: dir > 0 ? pts.length - 1 : 0, dir };
}

// Round the corner at pts[i] with an arc-like quadratic curve starting `r`
// along each neighbouring path. Returns a new polyline.
function fillet(pts, i, r, n = 8) {
  if (r <= 0) return pts;
  const a = walk(pts, i, -1, r), b = walk(pts, i, +1, r);
  const c = pts[i];
  const arc = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    arc.push([
      (1 - t) ** 2 * a.pt[0] + 2 * (1 - t) * t * c[0] + t * t * b.pt[0],
      (1 - t) ** 2 * a.pt[1] + 2 * (1 - t) * t * c[1] + t * t * b.pt[1],
    ]);
  }
  return [...pts.slice(0, a.idx + 1), ...arc, ...pts.slice(b.idx)];
}

// Drop repeated points (e.g. a tenon as wide as its foot, or a zero-width rim).
function clean(pts) {
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6);
}

// A tenon can be as wide as the part it sits under, never wider.
export function tenons(p) {
  return { top: Math.min(p.tenonD, p.hubBaseD), low: Math.min(p.nubTenonD, p.nubTopD) };
}

function findIndex(pts, r, z) {
  return pts.findIndex(p => Math.abs(p[0] - r) < 1e-6 && Math.abs(p[1] - z) < 1e-6);
}

export function trayGeometry(p) {
  const R = p.trayD / 2, T = p.trayT, d = Math.min(p.dish, T - 2);
  const rho = p.dishBitD / 2;
  const holeR = p.holeD / 2, rec = p.tenonH;
  const topRecR = tenons(p).top / 2, lowRecR = tenons(p).low / 2;
  const floorZ = T - d;
  const zc = floorZ + rho; // cove centre height
  const thTop = d < rho ? Math.asin((d - rho) / rho) : 0; // angle where the cove meets the rim top
  const rimInner = R - p.dishInset;
  const rc = rimInner - rho * Math.cos(thTop); // cove centre radius = where the flat floor ends
  const underR = Math.min(p.underR, R - 1);
  const lift = T - p.edgeT; // how far the underside rises at the edge

  const under = r => r <= underR ? 0 : lift * ((r - underR) / (R - underR)) ** p.underP;

  const pts = [];
  pts.push([holeR, rec], [lowRecR, rec], [lowRecR, 0]);
  // underside: flat, then curving up to the edge
  pts.push([underR, 0]);
  const N = 40;
  for (let k = 1; k <= N; k++) { const r = lerp(underR, R, k / N); pts.push([r, under(r)]); }
  pts.push([R, T]);
  // rim top, inwards to the dish wall
  pts.push([rimInner, T]);
  // cove made by the dish bit, from the rim top down to the floor
  if (d > rho) pts.push([rc + rho, zc]);
  const A = 12;
  for (let k = 1; k <= A; k++) {
    const th = lerp(thTop, -Math.PI / 2, k / A);
    pts.push([rc + rho * Math.cos(th), zc + rho * Math.sin(th)]);
  }
  pts.push([topRecR, floorZ], [topRecR, floorZ - rec], [holeR, floorZ - rec]);

  let out = clean(pts);
  out = fillet(out, findIndex(out, R, T), p.edgeR);
  out = fillet(out, findIndex(out, R, lift), p.edgeR);
  if (p.dishInset >= 1) out = fillet(out, findIndex(out, rimInner, T), Math.min(1, p.dishInset / 4));

  // thinnest wood between the dish floor/cove and the underside
  let minT = Infinity, minAt = 0;
  for (let r = holeR; r <= R; r += 0.5) {
    let top = T;
    if (r <= topRecR) top = floorZ - rec;
    else if (r <= rc) top = floorZ;
    else if (r < rimInner) {
      const dx = r - rc;
      top = dx >= rho ? T : Math.min(T, zc - Math.sqrt(Math.max(0, rho * rho - dx * dx)));
    }
    const t = top - (r <= lowRecR ? rec : under(r));
    if (t < minT) { minT = t; minAt = r; }
  }
  const centreT = T - d - 2 * rec;

  return { profile: out, R, T, floorZ, rc, rimInner, underR, lift, under, minT, minAt, centreT, dish: d, topRecR, lowRecR };
}

const tenonLen = p => Math.max(0.5, p.tenonH - 0.5);

export function hubGeometry(p) {
  const holeR = p.holeD / 2, tR = tenons(p).top / 2, baseR = p.hubBaseD / 2, topR = p.hubTopD / 2;
  const tl = tenonLen(p), H = p.hubH, foot = p.hubFoot;
  const pts = [[holeR, -tl], [tR, -tl], [tR, 0], [baseR, 0], [baseR, foot]];
  const N = 48;
  for (let k = 1; k <= N; k++) {
    const s = k / N;
    pts.push([topR + (baseR - topR) * (1 - s) ** p.hubK, lerp(foot, H, s)]);
  }
  pts.push([holeR, H]);
  let out = clean(pts);
  out = fillet(out, out.length - 2, 1.5);
  out = fillet(out, findIndex(out, baseR, foot), Math.min(foot * 0.8, 1));
  return { profile: out, H, tenonLen: tl, baseR, topR, tenonR: tR };
}

export function nubGeometry(p) {
  const holeR = p.holeD / 2, tR = tenons(p).low / 2, topR = p.nubTopD / 2, tipR = p.nubTipD / 2;
  const tl = tenonLen(p), L = p.nubL;
  const pts = [[holeR, -L], [tipR, -L]];
  const N = 40;
  for (let k = 1; k <= N; k++) {
    const s = k / N;
    pts.push([tipR + (topR - tipR) * s ** p.nubK, lerp(-L, 0, s)]);
  }
  pts.push([tR, 0], [tR, tl], [holeR, tl]);
  let out = fillet(clean(pts), 1, 1);
  if (tR < topR - 0.5) out = fillet(out, findIndex(out, topR, 0), 1.5);
  return { profile: out, L, tenonLen: tl, topR, tipR, tenonR: tR };
}

// Where everything sits, measured in mm up from the floor.
export function layout(p) {
  const tray = trayGeometry(p);
  const tubesLen = p.tubeN * p.tubeL + (p.tubeN - 1) * p.tubeGap;
  const plateBottom = p.ceilingH - p.plateT;
  const tubeBottom = plateBottom - tubesLen;
  const hubTop = tubeBottom - WASHER.t;
  const dishFloor = hubTop - p.hubH;
  const trayBottom = dishFloor - tray.floorZ;
  const trayTop = trayBottom + p.trayT;
  const nubBottom = trayBottom - p.nubL;
  const lowWasherBottom = nubBottom - WASHER.t;
  const nutBottom = lowWasherBottom - NUT.h;
  const rodTop = tubeBottom + p.tubeEngage;
  const rodBottom = lowWasherBottom - NUT.thread;
  const rodLen = Math.ceil(rodTop - rodBottom);
  const tubes = [];
  for (let i = 0; i < p.tubeN; i++) {
    const bottom = tubeBottom + i * (p.tubeL + p.tubeGap);
    tubes.push({ bottom, top: bottom + p.tubeL });
  }
  return {
    tray, tubesLen, plateBottom, tubeBottom, hubTop, dishFloor, trayBottom, trayTop,
    nubBottom, lowWasherBottom, nutBottom, rodTop, rodBottom, rodLen, tubes,
    hubTenon: tenonLen(p), nubTenon: tenonLen(p),
    floorClear: nutBottom,
  };
}

export function warnings(p, L) {
  const w = [];
  const t = L.tray;
  if (t.minT < 6) w.push(`The tray is only ${t.minT.toFixed(1)} mm thick at radius ${t.minAt.toFixed(0)} mm. Keep at least 6 mm: lower the dish, the edge lift, or move the underside curve outwards.`);
  if (t.centreT < 6) w.push(`Only ${t.centreT.toFixed(1)} mm of wood is left between the two recesses. Make the recesses shallower or the dish shallower.`);
  const tn = tenons(p);
  if (Math.min(tn.top, tn.low) <= p.holeD + 6) w.push('A tenon is barely wider than the bore. Make it at least 6 mm wider.');
  if (p.tenonD > p.hubBaseD) w.push(`The upper tenon is capped at the hub foot (Ø${p.hubBaseD}).`);
  if (p.nubTenonD > p.nubTopD) w.push(`The lower tenon is capped at the nub top (Ø${p.nubTopD}).`);
  if (p.hubBaseD / 2 > t.rc) w.push('The hub foot is wider than the flat dish floor.');
  if (p.nubTopD / 2 > t.underR) w.push('The nub is wider than the flat part of the underside.');
  if (p.nubTipD < 17.5) w.push(`The nub tip (Ø${p.nubTipD}) is narrower than the acorn nut (17 mm across flats).`);
  if (L.trayTop < 600 || L.trayTop > 1200) w.push(`The tray top is at ${(L.trayTop / 10).toFixed(1)} cm. Change the number of tubes or the hub height.`);
  if (p.ringStep > p.bitD) w.push('The router ring width is wider than the straight bit, so ridges would be left uncut.');
  if (p.trayT > p.bitL) w.push('The straight bit is shorter than the board is thick, so it cannot cut the disc free.');
  return w;
}
