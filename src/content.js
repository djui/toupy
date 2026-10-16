// Bill of materials, cut layout, routing plan and assembly steps.
import { Sheet } from './drawings.js';
import { WASHER, NUT } from './model.js';

const f = n => (Math.round(n * 10) / 10).toString();
const thread = p => p.pitch === '1.5' ? 'M10' : 'M10×1';

// ---------------------------------------------------------------- blanks
export function blanks(p, L) {
  const allowance = 5; // to face off and clean up
  const hubLen = p.hubH + L.hubTenon + allowance;
  const nubLen = p.nubL + L.nubTenon + allowance;
  return {
    hub: { side: Math.ceil(p.hubBaseD + 4), layers: Math.ceil(hubLen / p.trayT), need: hubLen },
    nub: { side: Math.ceil(p.nubTopD + 4), layers: Math.ceil(nubLen / p.trayT), need: nubLen },
  };
}

// Square blank for the tray (the sled rides on its corners), then the hub
// and nub squares packed into the strip left over.
export function cutLayout(p, L, plan) {
  const kerf = 3;
  const W = p.sheetW, H = p.sheetL;
  const B = blanks(p, L);
  const blank = Math.min(W, H);
  const squares = [
    ...Array.from({ length: B.hub.layers }, (_, i) => ({ s: B.hub.side, label: `H${i + 1}` })),
    ...Array.from({ length: B.nub.layers }, (_, i) => ({ s: B.nub.side, label: `N${i + 1}` })),
  ];
  // shelf packing in the strip [0, W] × [blank + kerf, H]
  const placed = [], missing = [];
  let x = 0, y = blank + kerf, rowH = 0;
  for (const sq of squares) {
    if (x + sq.s > W) { x = 0; y += rowH + kerf; rowH = 0; }
    if (y + sq.s > H || sq.s > W) { missing.push(sq); continue; }
    placed.push({ ...sq, x, y });
    x += sq.s + kerf; rowH = Math.max(rowH, sq.s);
  }

  const sh = new Sheet();
  sh.poly([[0, 0], [W, 0], [W, H], [0, H]], 'sheet');
  sh.poly([[0, 0], [blank, 0], [blank, blank], [0, blank]], 'outline', true);
  const c = blank / 2;
  sh.add(`<circle class="disc" cx="${c}" cy="${c}" r="${p.trayD / 2}"/>`);
  sh.add(`<circle class="thinDash" cx="${c}" cy="${c}" r="${plan.sled.footAt}"/>`);
  sh.text(c, c - 6, `tray Ø${f(p.trayD)}`, { size: 14 });
  sh.text(c, c + 14, `blank ${blank} × ${blank}`, { size: 10 });
  sh.text(c, c + plan.sled.footAt - 8, 'sled foot path — keep this ring flat and untouched', { size: 8 });
  for (const q of placed) {
    sh.poly([[q.x, q.y], [q.x + q.s, q.y], [q.x + q.s, q.y + q.s], [q.x, q.y + q.s]], q.label[0] === 'H' ? 'sqH' : 'sqN');
    sh.text(q.x + q.s / 2, q.y + q.s / 2 + 4, q.label, { size: Math.min(14, q.s / 3) });
  }
  sh.dimH(0, 0, W, 0, -20, `${W}`, 12);
  sh.dimV(W, 0, W, H, W + 24, `${H}`, 12);
  return { svg: sh.svg({ pad: 10 }), placed, missing, B, blank };
}

// ---------------------------------------------------------------- BOM
export function bom(p, L, plan, cut) {
  const B = cut.B;
  const rodBuy = Math.ceil(L.rodLen / 50) * 50;
  return [
    { group: 'Wood', rows: [
      ['1', `Oak sheet ${p.sheetW} × ${p.sheetL} × ${f(p.trayT)} mm (glued strips)`, 'tray + hub and nub layers'],
      ['—', 'Wood glue (PVA, D3)', `laminating ${B.hub.layers} + ${B.nub.layers} squares`],
      ['—', 'Hardwax oil or oil finish', 'all wood parts'],
      ['—', 'Sandpaper 80, 120, 180, 240', ''],
    ]},
    { group: 'Brass and fixings', rows: [
      [String(p.tubeN), `Brass tube Ø${f(p.tubeD)} × ${f(p.tubeL)} mm, ${thread(p)}, with connectors`, 'you have 6'],
      ['1', `Threaded rod ${thread(p)}, ${L.rodLen} mm (buy ${rodBuy}, cut with a hacksaw)`, 'brass, or steel: it is hidden'],
      ['1', `Acorn nut ${thread(p)} (DIN 1587), brass`, `bottom tip, ${NUT.s} mm across flats`],
      ['2', `Washer M10, Ø${WASHER.d} × ${WASHER.t} mm, brass`, 'hub top, under the nub'],
      ['1', `Ceiling plate Ø${f(p.plateD)} with ${thread(p)} centre thread`, 'lamp hanging cup'],
      ['3', 'Screws Ø5 × 50 mm + 8 mm plugs for concrete', 'ceiling plate'],
    ]},
    { group: 'Jig and tools', rows: [
      ['1', `Plywood or MDF strip ${plan.sled.length} × ${plan.sled.width} × ${f(p.sledT)} mm`, 'routing sled'],
      ['1', 'M10 threaded rod 120 mm + 2 nuts + 2 washers', 'centre pivot pin'],
      ['1', `Spoil board at least ${cut.blank + 50} × ${cut.blank + 50} mm`, 'MDF or chipboard'],
      ['1', `Forstner bit Ø${f(p.tenonD)}`, 'tray recesses'],
      ['1', `Drill bit Ø${f(p.holeD)} (brad point), long`, 'bores'],
      ['—', `Straight bit Ø${f(p.bitD)}, dish bit Ø${f(p.dishBitD)}`, 'you have these'],
      ['—', 'Double-sided tape, clamps, hacksaw, file', ''],
    ]},
  ];
}

// ---------------------------------------------------------------- router plan
export function routerSteps(p, L, plan) {
  const s = plan.sled;
  const tbl = (rows, coveRow) => `<table class="passes"><thead><tr><th>#</th><th>Pivot → bit centre</th><th>Final depth</th><th>Passes (depth below the surface)</th></tr></thead><tbody>${
    rows.map((r, i) => `<tr><td>${i + 1}</td><td>${f(r.centre)} mm</td><td>${f(r.depth)} mm</td><td>${r.passes.map(f).join(' → ')}</td></tr>`).join('')
  }${coveRow ? `<tr class="cove"><td>dish bit</td><td>${f(coveRow.centre)} mm</td><td>${f(coveRow.depth)} mm</td><td>${coveRow.passes.map(f).join(' → ')}</td></tr>` : ''}</tbody></table>`;
  return `
<h3>The sled</h3>
<p>A strip of plywood ${s.length} × ${s.width} × ${f(p.sledT)} mm. Drill an ${f(p.holeD)} mm pivot hole near one end. Cut a slot along the centre line from ${s.slotFrom} to ${s.slotTo} mm from the pivot, wide enough for the bit. The far end rests directly on the untouched corners of the square blank, about ${s.footAt} mm from the pivot (a strip of smooth tape underneath helps it glide). So every depth below is measured from the blank's surface. Mark the slot every 5 mm from the pivot. Clamp the router over the slot at each ring's radius.</p>
${s.ok ? '' : `<p class="warn">The blank is too small for the sled foot to stay outside the disc. Use a larger blank or a smaller tray.</p>`}
<p>Pivot: a short M10 rod screwed into the spoil board, through the tray's bore. Set a nut on it so the sled rests on the nut at exactly the blank's surface height. Keep the rod flush with the top of the sled, so the router base can pass over it for the innermost rings.</p>
<p>Every depth is set on the router as <b>sled thickness ${f(p.sledT)} mm + depth</b>.</p>

<h3>Order of work</h3>
<ol>
<li>Cross-cut the ${f(plan.sled.blank)} × ${f(plan.sled.blank)} mm square blank. Mark the centre and drill the Ø${f(p.holeD)} bore straight through (use a drill guide; it must be square to the face).</li>
<li>Underside face up. Drill the bottom recess with the Forstner bit: Ø${f(p.tenonD)} × ${f(p.tenonH)} mm deep.</li>
<li>Screw the blank's corners to the spoil board (outside the foot path) with the pivot rod through the bore.</li>
<li>Rout the underside rings with the Ø${f(p.bitD)} straight bit, from the inside out. Rings are up to ${f(plan.ringW)} mm wide, narrower where the curve gets steeper. Each is cut to the depth at its inner edge, so steps of at most ${f(plan.maxStep)} mm stay above the curve. You sand them down to the gauge later.
${plan.under.length ? tbl(plan.under) : '<p>No underside curve with these settings.</p>'}</li>
<li>Cut the circle with your normal circle-cutting attachment (no sled needed): bit centre at ${f(plan.cutCentre)} mm from the pivot, down to ${f(plan.throughFirst)} mm. Leave about 1 mm so the disc stays attached.</li>
<li>Unscrew, flip to the top face, and screw down again on the same pivot hole in the spoil board.</li>
<li>Rout the flat dish floor with the straight bit, from the inside out. Then cut the cove at the rim with the dish bit centred at ${f(plan.cove.centre)} mm.
${tbl(plan.floor, plan.cove)}</li>
<li>Drill the top recess: Ø${f(p.tenonD)} × ${f(p.tenonH)} mm deep, below the dish floor.</li>
<li>Put double-sided tape under the disc, then cut the last ~1 mm of the circle from the top.</li>
<li>Round the top and bottom edges (R${f(p.edgeR)}). Sand the underside steps until the printed underside gauge sits flush all the way round, then the dish. Finish with 240.</li>
</ol>`;
}

// ---------------------------------------------------------------- lathe + assembly
export function latheSteps(p, L, cut) {
  const B = cut.B;
  return `
<ol>
<li>Glue ${B.hub.layers} squares of ${B.hub.side} mm (${B.hub.layers * p.trayT} mm tall; the hub needs ${f(B.hub.need)}) and ${B.nub.layers} squares of ${B.nub.side} mm (${B.nub.layers * p.trayT} mm; the nub needs ${f(B.nub.need)}). Alternate the grain direction of each layer by 90° to keep them stable, or keep it aligned for a calmer look. Drill the Ø${f(p.holeD)} bore through each stack after gluing.${B.hub.layers * p.trayT < B.hub.need + 10 ? ' There is little spare length, so glue a scrap block on the top layer (with paper in the joint) for the chuck, and part it off at the end.' : ''}</li>
<li>Mount on a mandrel or between centres through the bore, so the bore and the outside stay concentric.</li>
<li>Turn the tenon first: Ø${f(p.tenonD)} × ${f(L.hubTenon)} mm for the hub and ${f(L.nubTenon)} mm for the nub. They're 0.5 mm shorter than the recess, so the shoulder seats. Check the fit in the tray's recess: snug, no glue.</li>
<li>Turn the profile, checking against the printed 1:1 gauge and the diameter table at each height.</li>
<li>Sand, oil, and make sure the hub's top face is flat, so the washer seats.</li>
</ol>`;
}

export function assemblySteps(p, L) {
  return `
<ol>
<li>Find the ceiling spot, at least ${Math.ceil(p.trayD / 2 + 40)} mm from the wall. Mark the plate's 3 holes, drill for the 8 mm plugs and screw the plate up.</li>
<li>Screw the ${p.tubeN} tubes together with their connectors. Screw the top tube into the plate.</li>
<li>Screw the ${L.rodLen} mm rod ${f(p.tubeEngage)} mm into the bottom tube (a drop of thread lock is good).</li>
<li>From below, slide on: a washer, the upper hub (tenon down), the tray (dish up), the lower nub (tenon up), a washer.</li>
<li>Screw on the acorn nut and tighten by hand until the stack is firm. With no pin, the tray can still be turned by hand with a little force; that's expected.</li>
<li>The tray top is now ${f(L.trayTop / 10)} cm from the floor. The lowest point is ${f(L.nutBottom / 10)} cm.</li>
</ol>`;
}
