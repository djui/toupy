// 1:1 printable templates, tiled onto A4 portrait pages.
import { Sheet } from './drawings.js';
import { trayGeometry, hubGeometry, nubGeometry } from './model.js';

const PAGE_W = 186, PAGE_H = 250, OVERLAP = 10;
const f = n => (Math.round(n * 100) / 100).toString();

function trayGauge(p) {
  const t = trayGeometry(p);
  const sh = new Sheet();
  const pts = t.profile.map(([r, z]) => [r, -z]);
  sh.poly(pts, 'tpl');
  sh.line(0, 8, 0, -t.T - 8, 'centre');
  sh.text(t.R / 2, -t.T - 6, 'TRAY half profile — top line = dish gauge, bottom line = underside gauge', { size: 3.5, cls: 'title' });
  sh.text(4, 7, 'centre', { size: 3, anchor: 'start' });
  sh.text(t.R, 7, `edge r ${f(t.R)}`, { size: 3, anchor: 'end' });
  return sh;
}

function silhouette(profile, title) {
  const sh = new Sheet();
  sh.poly(profile.map(([r, z]) => [r, -z]), 'tpl');
  sh.poly(profile.map(([r, z]) => [-r, -z]), 'tpl');
  const zs = profile.map(p => p[1]);
  sh.line(0, -Math.max(...zs) - 6, 0, -Math.min(...zs) + 6, 'centre');
  sh.text(0, -Math.max(...zs) - 10, title, { size: 3.5, cls: 'title' });
  return sh;
}

function tiles(sh, name) {
  let [x0, y0, x1, y1] = sh.box;
  x0 -= 4; y0 -= 4; x1 += 4; y1 += 4;
  let content = sh.els.join('');
  let w = x1 - x0, h = y1 - y0;
  if ((w > PAGE_W || h > PAGE_H) && h <= PAGE_W && w <= PAGE_H) {
    content = `<g transform="rotate(-90)">${content}</g>`;
    [x0, y0, x1, y1] = [y0, -x1, y1, -x0];
    [w, h] = [h, w];
  }
  const cols = Math.max(1, Math.ceil((w - OVERLAP) / (PAGE_W - OVERLAP)));
  const rows = Math.max(1, Math.ceil((h - OVERLAP) / (PAGE_H - OVERLAP)));
  const pages = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tx = x0 + c * (PAGE_W - OVERLAP), ty = y0 + r * (PAGE_H - OVERLAP);
    let grid = '';
    for (let gx = Math.ceil(tx / 10) * 10; gx <= tx + PAGE_W; gx += 10) grid += `<line class="grid" x1="${gx}" y1="${ty}" x2="${gx}" y2="${ty + PAGE_H}"/>`;
    for (let gy = Math.ceil(ty / 10) * 10; gy <= ty + PAGE_H; gy += 10) grid += `<line class="grid" x1="${tx}" y1="${gy}" x2="${tx + PAGE_W}" y2="${gy}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="drawing tplsvg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="${f(tx)} ${f(ty)} ${PAGE_W} ${PAGE_H}">${grid}${content}</svg>`;
    const label = rows * cols > 1 ? `tile ${String.fromCharCode(65 + r)}${c + 1} of ${rows}×${cols} — overlap ${OVERLAP} mm, line up the 10 mm grid` : 'one page';
    pages.push({ name, label, svg });
  }
  return pages;
}

export function templatePages(p) {
  return [
    ...tiles(trayGauge(p), 'Tray profile gauge'),
    ...tiles(silhouette(hubGeometry(p).profile, 'UPPER HUB — 1:1 turning gauge'), 'Upper hub'),
    ...tiles(silhouette(nubGeometry(p).profile, 'LOWER NUB — 1:1 turning gauge'), 'Lower nub'),
  ];
}

export function calibrationBar() {
  let ticks = '';
  for (let i = 0; i <= 100; i += 10) ticks += `<line class="outline" x1="${i}" y1="0" x2="${i}" y2="${i % 50 ? 2 : 3.5}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="drawing" width="110mm" height="8mm" viewBox="-2 -1 110 8">${ticks}<line class="outline" x1="0" y1="0" x2="100" y2="0"/><text class="txt" x="103" y="3" font-size="3">100 mm</text></svg>`;
}

export function calibrationSquare() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="drawing" width="110mm" height="110mm" viewBox="-5 -5 110 110"><rect class="outline" x="0" y="0" width="100" height="100" fill="none"/><text class="txt" x="50" y="52" font-size="5" text-anchor="middle">100 × 100 mm</text><text class="txt" x="50" y="60" font-size="3" text-anchor="middle">Measure both sides before cutting anything</text></svg>`;
}
