// Stepped-ring routing plan for the tray: a sled pivots on the centre pin and
// rides on the untouched corners of the square blank, so every depth is
// measured from the blank's surface. The sled sits LIFT mm above that
// surface (nuts on the pin at one end, a foot block at the other), so the
// pivot nuts never touch the wood and the bit can cut right up to the bore.

export const LIFT = 10;
// Recesses up to this size are drilled with a Forstner bit; wider ones are routed.
export const FORSTNER_MAX = 40;

const r1 = x => Math.round(x * 10) / 10;

function passes(depth, max) {
  const n = Math.max(1, Math.ceil(depth / max - 1e-9));
  return Array.from({ length: n }, (_, i) => r1(depth * (i + 1) / n));
}

export function routerPlan(p, tray) {
  const b = p.bitD, w = Math.min(p.ringStep, b);
  const holeR = p.holeD / 2;

  // Flat rings from the bore out to rOut, ending exactly on rOut.
  const flatRings = (rOut, depth) => {
    const out = [];
    const last = rOut - b / 2;
    if (last < holeR + b / 2 - 0.01) return out;
    for (let c = holeR + b / 2; ; c += w) {
      const centre = Math.min(c, last);
      out.push({ inner: r1(centre - b / 2), centre: r1(centre), depth: r1(depth), passes: passes(depth, p.maxPass) });
      if (centre === last) break;
    }
    return out;
  };
  const recess = (r, depth) => 2 * r <= FORSTNER_MAX ? null : flatRings(r, depth);

  // Underside: rings from where the curve starts out to the edge.
  // Each ring is cut to the depth at its inner edge, so the steps stay
  // above the final curve and get sanded down to it.
  const under = [];
  let maxStep = 0;
  // Rings get narrower where the curve gets steeper, so no step is taller
  // than SAND mm (what's left to sand away).
  const SAND = 1;
  const nextRing = a => {
    let x = a;
    while (x < a + w && x < tray.R && tray.under(x + 0.5) - tray.under(a) <= SAND) x += 0.5;
    return Math.max(x, a + 1);
  };
  for (let a = nextRing(tray.underR); a < tray.R; a = nextRing(a)) {
    const depth = tray.under(a);
    if (depth < 0.2) continue;
    const next = tray.under(Math.min(tray.R, nextRing(a)));
    maxStep = Math.max(maxStep, next - depth);
    under.push({ inner: r1(a), centre: r1(a + b / 2), depth: r1(depth), passes: passes(depth, p.maxPass) });
  }

  // Top: flat floor out to the cove centre, then the dish bit forms the wall.
  const floor = flatRings(tray.rc, tray.dish);
  const topRecess = recess(tray.topRecR, tray.dish + p.tenonH);
  const lowRecess = recess(tray.lowRecR, p.tenonH);
  const cove = { centre: r1(tray.rc), depth: r1(tray.dish), passes: passes(tray.dish, p.maxPass) };

  const cutCentre = r1(tray.R + b / 2);
  const throughFirst = r1(p.trayT - 1);

  const blank = Math.min(p.sheetW, p.sheetL);
  const footAt = Math.floor(Math.min(tray.R + b + 40, blank / 2 - 25));
  const sled = {
    blank,
    ok: footAt >= tray.R + b + 15,
    length: footAt + 40,
    width: Math.ceil(Math.max(120, p.baseD * 0.8)),
    footAt,
    slotFrom: Math.floor(holeR),
    slotTo: Math.ceil(tray.R + b),
    t: p.sledT,
  };

  return { under, floor, cove, topRecess, lowRecess, cutCentre, throughFirst, sled, maxStep: r1(maxStep), ringW: w };
}
