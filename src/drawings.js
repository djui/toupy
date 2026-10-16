// Dimensioned SVG drawings. Every drawing is built in millimetres, so the
// same SVG prints at 1:1 when given a width in mm.
import { trayGeometry, hubGeometry, nubGeometry, WASHER, NUT } from './model.js';

const f = n => (Math.round(n * 10) / 10).toString();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// k scales text, arrows and line weights for drawings that are shown or
// printed much smaller than 1:1.
export class Sheet {
  constructor({ k = 1 } = {}) { this.k = k; this.els = []; this.box = [Infinity, Infinity, -Infinity, -Infinity]; }
  grow(x, y) {
    const b = this.box;
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  add(svg, ...pts) { this.els.push(svg); for (const [x, y] of pts) this.grow(x, y); }
  line(x1, y1, x2, y2, cls = 'thin') { this.add(`<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`, [x1, y1], [x2, y2]); }
  poly(pts, cls, closed = true) {
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (closed ? 'Z' : '');
    this.add(`<path class="${cls}" d="${d}"/>`, ...pts);
  }
  text(x, y, s, { size = 3.2 * this.k, anchor = 'middle', rotate = 0, cls = 'txt' } = {}) {
    const tr = rotate ? ` transform="rotate(${rotate} ${f(x)} ${f(y)})"` : '';
    this.add(`<text class="${cls}" x="${f(x)}" y="${f(y)}" font-size="${f(size)}" text-anchor="${anchor}"${tr}>${esc(s)}</text>`);
    const w = s.length * size * 0.56, h = size;
    if (rotate) { this.grow(x - h, y - w / 2); this.grow(x + 1, y + w / 2); return; }
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    this.grow(x0, y - h); this.grow(x0 + w, y + 1);
  }
  arrow(x, y, ang) {
    const size = 2.2 * this.k, a1 = ang + 0.32, a2 = ang - 0.32;
    this.add(`<path class="arrow" d="M${f(x)} ${f(y)}L${f(x - size * Math.cos(a1))} ${f(y - size * Math.sin(a1))}L${f(x - size * Math.cos(a2))} ${f(y - size * Math.sin(a2))}Z"/>`);
  }
  // Horizontal dimension between two feature points, dimension line at yLine.
  dimH(x1, y1, x2, y2, yLine, label) {
    const k = this.k, g = k, size = 3.2 * k;
    const s1 = Math.sign(yLine - y1) || -1, s2 = Math.sign(yLine - y2) || -1;
    this.line(x1, y1 + s1 * g, x1, yLine + s1 * 1.5 * k);
    this.line(x2, y2 + s2 * g, x2, yLine + s2 * 1.5 * k);
    const a = Math.min(x1, x2), b = Math.max(x1, x2);
    if (b - a > Math.max(8 * k, label.length * size * 0.6)) {
      this.line(a, yLine, b, yLine);
      this.arrow(a, yLine, Math.PI); this.arrow(b, yLine, 0);
      this.text((a + b) / 2, yLine - k, label);
    } else {
      this.line(a - 7 * k, yLine, b + 7 * k, yLine);
      this.arrow(a, yLine, 0); this.arrow(b, yLine, Math.PI);
      this.text(b + 8 * k, yLine + size * 0.35, label, { anchor: 'start' });
    }
  }
  dimV(x1, y1, x2, y2, xLine, label) {
    const k = this.k, g = k, size = 3.2 * k;
    const s1 = Math.sign(xLine - x1) || 1, s2 = Math.sign(xLine - x2) || 1;
    this.line(x1 + s1 * g, y1, xLine + s1 * 1.5 * k, y1);
    this.line(x2 + s2 * g, y2, xLine + s2 * 1.5 * k, y2);
    const a = Math.min(y1, y2), b = Math.max(y1, y2);
    if (b - a > Math.max(8 * k, label.length * size * 0.6)) {
      this.line(xLine, a, xLine, b);
      this.arrow(xLine, a, -Math.PI / 2); this.arrow(xLine, b, Math.PI / 2);
      this.text(xLine - k, (a + b) / 2, label, { rotate: -90 });
    } else {
      this.line(xLine, a - 7 * k, xLine, b + 7 * k);
      this.arrow(xLine, a, Math.PI / 2); this.arrow(xLine, b, -Math.PI / 2);
      this.text(xLine + 1.5 * k, a - 8 * k, label, { anchor: 'start' });
    }
  }
  note(x, y, tx, ty, label) {
    const size = 3.2 * this.k;
    this.line(x, y, tx, ty);
    this.add(`<circle class="dot" cx="${f(x)}" cy="${f(y)}" r="${f(0.6 * this.k)}"/>`);
    this.text(tx + (tx >= x ? 1 : -1) * this.k, ty + size * 0.35, label, { anchor: tx >= x ? 'start' : 'end' });
  }
  centre(x, y1, y2) { this.line(x, y1, x, y2, 'centre'); }
  svg({ pad = 6, widthMm = false, extra = '' } = {}) {
    const [x0, y0, x1, y1] = this.box;
    pad *= this.k;
    const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
    const size = widthMm ? ` width="${f(vb[2])}mm" height="${f(vb[3])}mm"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}"${size} class="drawing" style="--k:${this.k}">${extra}${this.els.join('')}</svg>`;
  }
}

export const DEFS = `<defs>${[['hatch', 1.6, 45], ['hatchB', 1.2, -45], ['hatchL', 4, 45], ['hatchBL', 3, -45]].map(([id, w, a]) =>
  `<pattern id="${id}" width="${w}" height="${w}" patternUnits="userSpaceOnUse" patternTransform="rotate(${a})"><line x1="0" y1="0" x2="0" y2="${w}" class="hatchline" stroke-width="${w / 8}"/></pattern>`).join('')}</defs>`;

// Draw a lathe profile as a full section (both halves) at (ox, oy), scale s.
function section(sh, profile, ox, oy, s = 1, cls = 'cut') {
  const right = profile.map(([r, z]) => [ox + r * s, oy - z * s]);
  const left = profile.map(([r, z]) => [ox - r * s, oy - z * s]);
  sh.poly(right, cls); sh.poly(left, cls);
  return { X: r => ox + r * s, Y: z => oy - z * s };
}

function clipRect(sh, x, y, w, h, id) {
  sh.add(`<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>`);
}

// ---------------------------------------------------------------- tray
let uid = 0;
function detail(p, t, title, r0, r1, dims) {
  const s = 3, sh = new Sheet({ k: Math.max(1.2, (r1 - r0) * s / 110) });
  const id = 'clip' + (++uid);
  const z0 = -3, z1 = t.T + 3;
  const x0 = r0 * s, y0 = -z1 * s, w = (r1 - r0) * s, h = (z1 - z0) * s;
  sh.add(`<clipPath id="${id}"><rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}"/></clipPath><g clip-path="url(#${id})">`);
  const box = [...sh.box];
  const S = section(sh, t.profile, 0, 0, s);
  sh.box = box; // only the framed part counts
  sh.add('</g>');
  sh.add(`<rect class="frame" x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}"/>`, [x0, y0], [x0 + w, y0 + h]);
  if (r0 < 0) sh.centre(0, y0, y0 + h);
  sh.text(x0, y0 - 14 * sh.k, title, { anchor: 'start', cls: 'title', size: 3.6 * sh.k });
  dims(sh, S);
  return sh.svg();
}

export function trayDrawing(p) {
  const t = trayGeometry(p);
  const sh = new Sheet({ k: 2.2 });
  const k = sh.k;
  const { X, Y } = section(sh, t.profile, 0, 0, 1, 'cutL');
  sh.centre(0, -t.T - 8 * k, 8 * k);
  sh.dimH(X(-t.R), Y(t.T), X(t.R), Y(t.T), Y(t.T) - 8 * k, `Ø${f(p.trayD)}`);
  sh.dimH(X(-t.underR), Y(0), X(t.underR), Y(0), 8 * k, `Ø${f(2 * t.underR)} flat underside`);
  sh.dimV(X(t.R), Y(0), X(t.R), Y(t.T), X(t.R) + 6 * k, `${f(t.T)}`);
  sh.text(-t.R, -t.T - 16 * k, 'TRAY — section', { anchor: 'start', cls: 'title', size: 3.6 * k });

  const ra = t.R - Math.max(p.dishInset + p.dishBitD + 6, 34);
  const A = detail(p, t, 'DETAIL A — rim, 3:1', ra, t.R + 3, (d, S) => {
    d.dimH(S.X(t.rimInner), S.Y(t.T), S.X(t.R), S.Y(t.T), S.Y(t.T) - 9 * d.k, `${f(p.dishInset)} rim`);
    d.dimV(S.X(t.rc), S.Y(t.floorZ), S.X(t.rc), S.Y(t.T), S.X(ra) - 4 * d.k, `${f(t.dish)} dish`);
    d.dimV(S.X(t.R), S.Y(t.lift), S.X(t.R), S.Y(t.T), S.X(t.R) + 8 * d.k, `${f(p.edgeT)} edge`);
    d.note(S.X(t.rc + p.dishBitD * 0.3), S.Y(t.floorZ + 0.6), S.X(t.rc) - 2, S.Y(0) + 10 * d.k, `cove R${f(p.dishBitD / 2)} (dish bit)`);
    d.note(S.X(t.R - p.edgeR * 0.3), S.Y(t.T - p.edgeR * 0.3), S.X(t.R) + 4 * d.k, S.Y(t.T) - 9 * d.k, `R${f(p.edgeR)}`);
  });
  const rb = Math.max(p.tenonD / 2 + 12, 28);
  const B = detail(p, t, 'DETAIL B — centre, 3:1', -rb, rb, (d, S) => {
    d.dimH(S.X(-p.tenonD / 2), S.Y(t.floorZ), S.X(p.tenonD / 2), S.Y(t.floorZ), S.Y(t.T) - 6 * d.k, `Ø${f(p.tenonD)} recess`);
    d.dimH(S.X(-p.holeD / 2), S.Y(0), S.X(p.holeD / 2), S.Y(0), S.Y(0) + 9 * d.k, `Ø${f(p.holeD)} bore`);
    d.dimV(S.X(p.tenonD / 2), S.Y(t.floorZ - p.tenonH), S.X(p.tenonD / 2), S.Y(t.floorZ), S.X(rb) + 6 * d.k, `${f(p.tenonH)}`);
    d.dimV(S.X(p.tenonD / 2), S.Y(0), S.X(p.tenonD / 2), S.Y(p.tenonH), S.X(rb) + 6 * d.k, `${f(p.tenonH)}`);
    d.dimV(S.X(-p.tenonD / 2), S.Y(p.tenonH), S.X(-p.tenonD / 2), S.Y(t.floorZ - p.tenonH), S.X(-rb) - 6 * d.k, `${f(t.centreT)}`);
  });
  return `<div class="tray-main">${sh.svg()}</div><div class="tray-details">${A}${B}</div>`;
}

// ---------------------------------------------------------------- hub / nub
export function hubDrawing(p) {
  const g = hubGeometry(p);
  const sh = new Sheet();
  const { X, Y } = section(sh, g.profile, 0, 0);
  sh.centre(0, -g.H - 10, g.tenonLen + 8);
  sh.dimH(X(-g.topR), Y(g.H), X(g.topR), Y(g.H), Y(g.H) - 10, `Ø${f(p.hubTopD)}`);
  sh.dimH(X(-g.baseR), Y(0), X(g.baseR), Y(0), Y(-g.tenonLen) + 16, `Ø${f(p.hubBaseD)} foot`);
  sh.dimH(X(-p.tenonD / 2), Y(-g.tenonLen), X(p.tenonD / 2), Y(-g.tenonLen), Y(-g.tenonLen) + 8, `Ø${f(p.tenonD)} tenon`);
  sh.dimV(X(g.topR), Y(g.H), X(g.baseR), Y(0), X(g.baseR) + 10, `${f(g.H)}`);
  sh.dimV(X(p.tenonD / 2), Y(-g.tenonLen), X(p.tenonD / 2), Y(0), X(g.baseR) + 10, `${f(g.tenonLen)}`);
  sh.dimV(X(-g.baseR), Y(0), X(-g.baseR), Y(p.hubFoot), X(-g.baseR) - 8, `${f(p.hubFoot)}`);
  sh.note(X(-p.holeD / 2), Y(g.H * 0.6), X(-g.baseR) + 4, Y(g.H * 0.85), `Ø${f(p.holeD)} bore through`);
  sh.text(0, Y(-g.tenonLen) + 28, 'UPPER HUB — section, 1:1 (grain along the axis)', { size: 3.8, cls: 'title' });
  return sh.svg();
}

export function nubDrawing(p) {
  const g = nubGeometry(p);
  const sh = new Sheet();
  const { X, Y } = section(sh, g.profile, 0, 0);
  sh.centre(0, -g.tenonLen - 8, g.L + 8);
  sh.dimH(X(-g.topR), Y(0), X(g.topR), Y(0), Y(g.tenonLen) - 12, `Ø${f(p.nubTopD)}`);
  sh.dimH(X(-p.tenonD / 2), Y(g.tenonLen), X(p.tenonD / 2), Y(g.tenonLen), Y(g.tenonLen) - 5, `Ø${f(p.tenonD)} tenon`);
  sh.dimH(X(-g.tipR), Y(-g.L), X(g.tipR), Y(-g.L), Y(-g.L) + 9, `Ø${f(p.nubTipD)}`);
  sh.dimV(X(g.topR), Y(0), X(g.tipR), Y(-g.L), X(g.topR) + 10, `${f(g.L)}`);
  sh.dimV(X(p.tenonD / 2), Y(0), X(p.tenonD / 2), Y(g.tenonLen), X(g.topR) + 10, `${f(g.tenonLen)}`);
  sh.note(X(-p.holeD / 2), Y(-g.L * 0.5), X(-g.topR) - 6, Y(-g.L * 0.7), `Ø${f(p.holeD)} bore`);
  sh.text(0, Y(-g.L) + 24, 'LOWER NUB — section, 1:1', { size: 3.8, cls: 'title' });
  return sh.svg();
}

// Radius of the outer surface at each height: what to set calipers to.
export function profileTable(p, which) {
  const rows = [];
  if (which === 'hub') {
    const H = p.hubH, baseR = p.hubBaseD / 2, topR = p.hubTopD / 2;
    for (let z = 0; z <= H + 1e-6; z += 5) {
      const s = Math.max(0, (z - p.hubFoot) / (H - p.hubFoot));
      rows.push([z, 2 * (topR + (baseR - topR) * (1 - s) ** p.hubK)]);
    }
  } else if (which === 'nub') {
    const L = p.nubL, topR = p.nubTopD / 2, tipR = p.nubTipD / 2;
    for (let z = 0; z <= L + 1e-6; z += 5) {
      const s = 1 - z / L;
      rows.push([z, 2 * (tipR + (topR - tipR) * s ** p.nubK)]);
    }
  } else {
    const t = trayGeometry(p);
    for (let r = Math.floor(t.underR / 10) * 10; r <= t.R + 1e-6; r += 10) rows.push([r, t.under(r)]);
    if (rows.at(-1)[0] !== t.R) rows.push([t.R, t.under(t.R)]);
  }
  return rows;
}

// ---------------------------------------------------------------- assembly
export function assemblyDrawing(p, L) {
  const sh = new Sheet({ k: 2.2 });
  const k = sh.k;
  const t = trayGeometry(p), hub = hubGeometry(p), nub = nubGeometry(p);
  const base = L.trayBottom;
  const Y = z => -(z - base); // trayBottom at y=0
  const half = pts => pts.map(([r, z]) => [r, z]);
  // wood
  const draw = (profile, dz, cls) => {
    sh.poly(half(profile).map(([r, z]) => [r, Y(z + dz)]), cls);
    sh.poly(half(profile).map(([r, z]) => [-r, Y(z + dz)]), cls);
  };
  draw(t.profile, L.trayBottom, 'cutL');
  draw(hub.profile, L.dishFloor, 'cutL');
  draw(nub.profile, L.trayBottom, 'cutL');
  // brass
  const rect = (r0, r1, z0, z1, cls = 'cutB') => {
    sh.poly([[r0, Y(z0)], [r1, Y(z0)], [r1, Y(z1)], [r0, Y(z1)]], cls);
    sh.poly([[-r0, Y(z0)], [-r1, Y(z0)], [-r1, Y(z1)], [-r0, Y(z1)]], cls);
  };
  rect(WASHER.hole / 2, WASHER.d / 2, L.hubTop, L.hubTop + WASHER.t);
  rect(WASHER.hole / 2, WASHER.d / 2, L.lowWasherBottom, L.lowWasherBottom + WASHER.t);
  const showTube = 60;
  rect(p.tubeD / 2 - 0.8, p.tubeD / 2, L.tubeBottom, L.tubeBottom + showTube);
  // rod (full, not cut)
  const rodTopShown = Math.min(L.rodTop, L.tubeBottom + showTube);
  sh.poly([[-5, Y(L.rodBottom)], [5, Y(L.rodBottom)], [5, Y(rodTopShown)], [-5, Y(rodTopShown)]], 'rod');
  // nut
  const hexH = NUT.h * 0.55, nb = L.nutBottom;
  sh.poly([[-NUT.s / 2, Y(nb + NUT.h)], [NUT.s / 2, Y(nb + NUT.h)], [NUT.s / 2, Y(nb + NUT.h - hexH)], [-NUT.s / 2, Y(nb + NUT.h - hexH)]], 'cutB');
  const domeR = NUT.s * 0.47, domeH = NUT.h - hexH;
  sh.add(`<path class="cutB" d="M${f(-domeR)} ${f(Y(nb + domeH))}A${f(domeR)} ${f(domeH)} 0 0 0 ${f(domeR)} ${f(Y(nb + domeH))}Z"/>`, [-domeR, Y(nb)], [domeR, Y(nb + domeH)]);
  // break line on the tube
  const bz = Y(L.tubeBottom + showTube);
  sh.poly([[-14, bz + 3], [-5, bz - 3], [5, bz + 3], [14, bz - 3]], 'outline', false);
  sh.centre(0, Y(L.tubeBottom + showTube) - 6, Y(L.nutBottom) + 8);

  // level marks on the right
  const x = t.R + 12 * k;
  const level = (z, label) => {
    sh.line(x - 6 * k, Y(z), x + 4 * k, Y(z), 'thin');
    sh.add(`<path class="arrow" d="M${f(x)} ${f(Y(z))}l${f(-2 * k)} ${f(-3 * k)}h${f(4 * k)}z"/>`);
    sh.text(x + 6 * k, Y(z) + 1.2 * k, label, { anchor: 'start' });
  };
  level(L.tubeBottom + showTube, `ceiling +${f(p.ceilingH)} (plate ${f(p.plateT)} + tubes ${p.tubeN} × ${f(p.tubeL)}${p.tubeGap ? ` + ${p.tubeN - 1} × ${f(p.tubeGap)}` : ''} above)`);
  level(L.hubTop, `hub top +${f(L.hubTop)}`);
  level(L.trayTop, `tray top +${f(L.trayTop)}`);
  level(L.trayBottom, `tray underside +${f(L.trayBottom)}`);
  level(L.nutBottom, `lowest point +${f(L.nutBottom)} (from the floor)`);
  sh.line(x - 2, Y(L.tubeBottom + showTube), x - 2, Y(L.nutBottom), 'thin');

  // balloons
  const balloon = (n, px, py, bx, by) => {
    sh.line(px, py, bx, by);
    const r = 4 * k;
    sh.add(`<circle class="balloon" cx="${f(bx)}" cy="${f(by)}" r="${f(r)}"/>`, [bx - r, by - r], [bx + r, by + r]);
    sh.text(bx, by + 1.2 * k, String(n));
  };
  balloon(1, -t.R * 0.7, Y(L.trayTop - 2), -t.R * 0.7, Y(L.trayTop) - 30);
  balloon(2, -hub.baseR * 0.4, Y(L.dishFloor + 20), -hub.baseR - 20, Y(L.hubTop) + 10);
  balloon(3, -nub.topR * 0.6, Y(L.trayBottom - 12), -nub.topR - 40, Y(L.nubBottom) + 4);
  balloon(4, -p.tubeD / 2, Y(L.tubeBottom + 35), -60, Y(L.tubeBottom + 50));
  balloon(5, -WASHER.d / 2, Y(L.hubTop + 0.7), -55, Y(L.hubTop + 18));
  balloon(6, 5, Y(L.trayTop + 30), 45, Y(L.hubTop + 40));
  balloon(7, -NUT.s / 2, Y(L.nutBottom + 6), -50, Y(L.nutBottom) + 12);
  sh.text(-t.R, Y(L.tubeBottom + 60) - 4 * k, 'ASSEMBLY — section through the axis', { anchor: 'start', cls: 'title', size: 3.6 * k });
  return sh.svg();
}
