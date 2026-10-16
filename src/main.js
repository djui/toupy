import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { GROUPS, ALL, DEFAULTS, load, save, toHash, BUILT_IN, loadPresets, savePreset, deletePreset, presetParams } from './params.js';
import { layout, warnings, trayGeometry, hubGeometry, nubGeometry } from './model.js';
import { routerPlan } from './router.js';
import { Viewer } from './scene.js';
import { partGeometries } from './parts3d.js';
import { trayDrawing, hubDrawing, nubDrawing, assemblyDrawing, profileTable, DEFS } from './drawings.js';
import { templatePages, calibrationBar, calibrationSquare } from './templates.js';
import { cutLayout, bom, routerSteps, latheSteps, assemblySteps } from './content.js';

const $ = s => document.querySelector(s);
const f = n => (Math.round(n * 10) / 10).toString();

let P = load();
let state = {};

// ---------------------------------------------------------------- controls
const BY_KEY = Object.fromEntries(ALL.map(p => [p.key, p]));
const FIXED_NOTE = {
  bought: 'Set by what you bought',
  measured: 'Measured on site',
  'your tool': 'Set by your tools',
};
const unlocked = new Set();
const isChanged = k => String(P[k]) !== String(DEFAULTS[k]);
const fmtDefault = p => p.options ? p.options.find(o => o[0] === String(p.def))[1].split(' ')[0] : `${p.def}${p.unit === '' ? '' : ' mm'}`;

function buildControls() {
  const host = $('#params');
  host.innerHTML = '';
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.open = matchMedia('(min-width: 821px)').matches && (g.id === 'tray' || g.id === 'hang');
    det.innerHTML = `<summary>${g.label}<span class="count" data-count="${g.id}"></span></summary>`;
    for (const p of g.params) {
      const row = document.createElement('div');
      row.className = 'param' + (p.fixed ? ' fixed' : '');
      row.dataset.row = p.key;
      const head = `<div class="lbl"><span>${p.label}</span>${
        p.fixed ? `<button class="lock" data-lock="${p.key}" title="${FIXED_NOTE[p.fixed]}. Locked so it isn't changed by accident; click to unlock."><svg viewBox="0 0 16 16" aria-hidden="true"><path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2"/><rect x="3.5" y="7" width="9" height="7" rx="1.5"/></svg>${p.fixed}</button>` : ''
      }<button class="reset" data-reset="${p.key}" title="Back to the default">↺ ${fmtDefault(p)}</button></div>`;
      if (p.options) {
        row.innerHTML = `${head}<select data-key="${p.key}" aria-label="${p.label}">${p.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      } else {
        const unit = p.unit ?? 'mm';
        row.innerHTML = `${head}<div class="inputs"><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-key="${p.key}" aria-label="${p.label}"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" data-key="${p.key}" aria-label="${p.label}"><i>${unit}</i></div>`;
      }
      det.appendChild(row);
    }
    host.appendChild(det);
  }
  host.addEventListener('input', e => {
    const k = e.target.dataset.key;
    if (!k) return;
    const v = e.target.tagName === 'SELECT' ? e.target.value : Number(e.target.value);
    if (e.target.type === 'number' && (e.target.value === '' || !Number.isFinite(v))) return;
    P = { ...P, [k]: v };
    syncInputs(e.target);
    schedule();
  });
  host.addEventListener('click', e => {
    const r = e.target.closest('[data-reset]'), l = e.target.closest('[data-lock]');
    if (r) { P = { ...P, [r.dataset.reset]: DEFAULTS[r.dataset.reset] }; syncInputs(); schedule(); }
    if (l) { const k = l.dataset.lock; unlocked.has(k) ? unlocked.delete(k) : unlocked.add(k); syncInputs(); }
  });
}

function syncInputs(except) {
  for (const el of document.querySelectorAll('#params [data-key]')) {
    if (el !== except) el.value = P[el.dataset.key];
    el.disabled = !!BY_KEY[el.dataset.key].fixed && !unlocked.has(el.dataset.key);
  }
  for (const row of document.querySelectorAll('#params [data-row]')) {
    const k = row.dataset.row;
    row.classList.toggle('changed', isChanged(k));
    row.classList.toggle('unlocked', unlocked.has(k));
  }
  for (const g of GROUPS) {
    const n = g.params.filter(p => isChanged(p.key)).length;
    $(`[data-count="${g.id}"]`).textContent = n ? `${n} changed` : '';
  }
  const total = ALL.filter(p => isChanged(p.key)).length;
  $('#changedAll').textContent = total ? `${total} value${total > 1 ? 's' : ''} changed from the defaults` : 'All values are the defaults';
}

// ---------------------------------------------------------------- presets
function renderPresets(selected = '') {
  const mine = Object.keys(loadPresets()).sort();
  $('#preset').innerHTML = `<option value="">Load a preset…</option>
    <optgroup label="Built in">${Object.keys(BUILT_IN).map(n => `<option>${n}</option>`).join('')}</optgroup>
    ${mine.length ? `<optgroup label="Yours">${mine.map(n => `<option>${n.replace(/</g, '&lt;')}</option>`).join('')}</optgroup>` : ''}`;
  $('#preset').value = selected;
  $('#presetDelete').disabled = !mine.includes(selected);
}

function wirePresets() {
  renderPresets();
  $('#preset').addEventListener('change', e => {
    const params = presetParams(e.target.value);
    $('#presetDelete').disabled = !(e.target.value in loadPresets());
    if (!params) return;
    P = params; syncInputs(); update();
  });
  $('#presetSave').addEventListener('click', () => {
    const name = prompt('Save the current values as a preset named:', $('#preset').value && !($('#preset').value in BUILT_IN) ? $('#preset').value : '')?.trim();
    if (!name || name in BUILT_IN) return;
    savePreset(name, P);
    renderPresets(name);
  });
  $('#presetDelete').addEventListener('click', () => {
    const name = $('#preset').value;
    if (!name || !confirm(`Delete the preset "${name}"?`)) return;
    deletePreset(name);
    renderPresets();
  });
}

let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(update, 60); }

// ---------------------------------------------------------------- hover text
function partInfo(p, L) {
  const t = trayGeometry(p);
  return {
    tray: `Tray — oak, Ø${f(p.trayD)} × ${f(p.trayT)} mm, dish ${f(t.dish)} mm, top at ${f(L.trayTop / 10)} cm`,
    hub: `Upper hub — oak, ${f(p.hubH)} mm tall, Ø${f(p.hubTopD)} → Ø${f(p.hubBaseD)}`,
    nub: `Lower nub — oak, ${f(p.nubL)} mm, Ø${f(p.nubTopD)} → Ø${f(p.nubTipD)}`,
    tube: `Brass tube Ø${f(p.tubeD)} × ${f(p.tubeL)} mm`,
    washer: 'Brass washer M10, Ø20 × 1.5 mm',
    nut: 'Brass acorn nut M10 (DIN 1587)',
    rod: `Threaded rod M10, ${L.rodLen} mm (hidden inside; shown beside when exploded)`,
    plate: `Ceiling plate Ø${f(p.plateD)} × ${f(p.plateT)} mm, 3 screws into concrete`,
  };
}

// ---------------------------------------------------------------- update
function update() {
  save(P);
  const L = layout(P);
  const plan = routerPlan(P, L.tray);
  const cut = cutLayout(P, L, plan);
  const warn = warnings(P, L);
  if (!plan.sled.ok) warn.push('The square blank is too small for the routing sled to ride outside the disc.');
  if (cut.missing.length) warn.push(`The sheet is too small for ${cut.missing.length} of the hub/nub squares (${cut.missing.map(m => m.label).join(', ')}).`);
  state = { L, plan, cut, warn };

  $('#warnings').innerHTML = warn.map(w => `<li>${w}</li>`).join('');
  $('#warnings').hidden = !warn.length;
  $('#keys').innerHTML = `
    <div><b>${f(L.trayTop / 10)}</b><span>cm tray top</span></div>
    <div><b>${f(L.nutBottom / 10)}</b><span>cm lowest point</span></div>
    <div><b>${L.rodLen}</b><span>mm rod</span></div>
    <div><b>${f(L.tray.minT)}</b><span>mm thinnest wood</span></div>`;

  viewer.build(P, L, partInfo(P, L));
  renderDocs();
}

function table(rows, head) {
  return `<table class="coords"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${typeof c === 'number' ? f(c) : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderDocs() {
  const { L, plan, cut } = state;
  $('#tab-drawings').innerHTML = `
    <section class="paper"><h2>1 · Assembly</h2>${assemblyDrawing(P, L)}
      <ol class="legend"><li>Tray</li><li>Upper hub</li><li>Lower nub</li><li>Brass tubes</li><li>Washers</li><li>Threaded rod</li><li>Acorn nut</li></ol></section>
    <section class="paper"><h2>2 · Tray</h2>${trayDrawing(P)}
      <h4>Underside: height of the curve above the flat underside</h4>${table(profileTable(P, 'tray').map(([r, z]) => [r, z]), ['radius mm', 'rise mm'])}</section>
    <section class="paper split"><div><h2>3 · Upper hub</h2>${hubDrawing(P)}</div>
      <div><h4>Diameter at each height above the foot</h4>${table(profileTable(P, 'hub'), ['height mm', 'Ø mm'])}</div></section>
    <section class="paper split"><div><h2>4 · Lower nub</h2>${nubDrawing(P)}</div>
      <div><h4>Diameter at each distance below the tray</h4>${table(profileTable(P, 'nub'), ['depth mm', 'Ø mm'])}</div></section>`;

  const pages = templatePages(P);
  $('#tab-templates').innerHTML = `
    <p class="lead">Print at <b>100% / Actual size</b> (not "Fit to page") on A4. Check the 100 mm square first. ${pages.length + 1} pages.</p>
    <button class="btn" data-print="templates">Print templates</button>
    <div class="pages">
      <div class="page"><h3>Calibration</h3>${calibrationSquare()}<p>If this square is not exactly 100 × 100 mm, fix the print scale before printing the rest.</p></div>
      ${pages.map((pg, i) => `<div class="page"><h3>${pg.name} <small>${pg.label} · page ${i + 2}</small></h3>${pg.svg}<div class="calbar">${calibrationBar()}</div></div>`).join('')}
    </div>`;

  $('#tab-router').innerHTML = `<section class="paper prose">${routerSteps(P, L, plan)}</section>`;
  $('#tab-build').innerHTML = `
    <section class="paper prose"><h2>Lathe: hub and nub</h2>${latheSteps(P, L, cut)}</section>
    <section class="paper prose"><h2>Hanging it</h2>${assemblySteps(P, L)}</section>`;
  $('#tab-bom').innerHTML = `
    <section class="paper"><h2>Bill of materials</h2>${bom(P, L, plan, cut).map(g => `<h4>${g.group}</h4>${table(g.rows, ['qty', 'item', 'for'])}`).join('')}</section>
    <section class="paper"><h2>Cut layout on the sheet</h2>${cut.svg}
      <p>Cut the ${cut.blank} × ${cut.blank} mm square first. The rest becomes ${cut.B.hub.layers} hub squares (H) of ${cut.B.hub.side} mm and ${cut.B.nub.layers} nub squares (N) of ${cut.B.nub.side} mm, plus offcuts for test cuts.</p></section>`;
}

// ---------------------------------------------------------------- STL
function exportSTL(which) {
  const L = state.L;
  const geos = partGeometries(P, L);
  const exporter = new STLExporter();
  const toZUp = g => g.clone().rotateX(Math.PI / 2);
  let obj;
  if (which === 'all') {
    obj = new THREE.Group();
    const put = (key, y) => { const m = new THREE.Mesh(geos[key].geo.clone()); m.position.y = y; obj.add(m); };
    put('hub', L.dishFloor); put('tray', L.trayBottom); put('nub', L.trayBottom);
    put('washerTop', L.hubTop); put('washerLow', L.lowWasherBottom); put('nut', L.nutBottom); put('rod', L.rodBottom);
    L.tubes.forEach(t => put('tube', t.bottom));
    put('plate', L.plateBottom);
    obj.rotation.x = Math.PI / 2;
    obj.updateMatrixWorld(true);
  } else {
    obj = new THREE.Mesh(toZUp(geos[which].geo));
  }
  const data = exporter.parse(obj, { binary: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'model/stl' }));
  a.download = `toupy-${which}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- printing
// Move (not copy) the content into #print, so SVG ids stay unique.
let moved = [];
function printMode(mode) {
  const root = $('#print');
  const sources = mode === 'templates' ? ['#tab-templates .pages'] : ['#tab-drawings', '#tab-router', '#tab-build', '#tab-bom'];
  for (const sel of sources) {
    const el = $(sel);
    const nodes = mode === 'templates' ? [el] : [...el.children];
    moved.push({ parent: nodes[0].parentNode, nodes });
    for (const n of nodes) root.appendChild(n);
  }
  document.body.dataset.print = mode;
  window.print();
}
window.addEventListener('afterprint', () => {
  for (const { parent, nodes } of moved) for (const n of nodes) parent.appendChild(n);
  moved = [];
  delete document.body.dataset.print;
});

// ---------------------------------------------------------------- wiring
const tip = $('#tip');
// Without WebGL the 3D tab shows a note; drawings and plans still work.
let viewer;
try {
  viewer = new Viewer($('#viewport'), {
    onHover(info, px) {
      if (!info || !px) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.textContent = info.label;
      tip.style.transform = `translate(${px.x + 14}px, ${px.y + 14}px)`;
    },
    onSamples(n) {
      $('#samples').textContent = n == null ? '' : n === 'preparing' ? 'Preparing the scene…'
        : n === 'compiling' ? 'Compiling (the first time takes a few seconds)…' : `${n} samples`;
    },
  });
} catch (err) {
  console.error(err);
  $('#viewport').insertAdjacentHTML('beforeend', '<p class="nogl">This browser cannot show 3D (WebGL is off). The other tabs still work.</p>');
  viewer = { build() {}, resize() {}, frame() {}, setExplode() {}, setCut() {}, setRayTraced() {}, setRoom() {} };
}

function showTab(id) {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.tab === id);
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + id;
  try { localStorage.setItem('toupy.tab', id); } catch { /* ignore */ }
  if (id === '3d') viewer.resize();
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tab) showTab(b.dataset.tab);
  if (b.dataset.view) viewer.frame(b.dataset.view);
  if (b.dataset.stl) exportSTL(b.dataset.stl);
  if (b.dataset.print) printMode(b.dataset.print);
  if (b.id === 'reset') { P = { ...DEFAULTS }; syncInputs(); update(); renderPresets(); }
  if (b.id === 'copy') {
    const url = location.href.split('#')[0] + toHash(P);
    navigator.clipboard?.writeText(url).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy link'), 1500); },
      () => prompt('Copy this link', url));
  }
});
$('#explode').addEventListener('input', e => viewer.setExplode(Number(e.target.value)));
$('#cut').addEventListener('change', e => viewer.setCut(e.target.checked));
$('#rt').addEventListener('change', e => viewer.setRayTraced(e.target.checked));
$('#room').addEventListener('change', e => viewer.setRoom(e.target.checked));
window.addEventListener('hashchange', () => { P = load(); syncInputs(); update(); });

document.body.insertAdjacentHTML('afterbegin', `<svg class="defs" aria-hidden="true">${DEFS}</svg>`);
buildControls();
wirePresets();
syncInputs();
update();
let startTab = '3d';
try { startTab = localStorage.getItem('toupy.tab') || '3d'; } catch { /* ignore */ }
showTab(document.getElementById('tab-' + startTab) ? startTab : '3d');
