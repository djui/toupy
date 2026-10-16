// Every editable dimension, in millimetres unless noted.
// Defaults are traced from photos of the 44 cm original (see README).

export const GROUPS = [
  {
    id: 'tray', label: 'Tray', params: [
      { key: 'trayD', label: 'Diameter', min: 300, max: 600, step: 1, def: 440 },
      { key: 'trayT', label: 'Board thickness', min: 15, max: 40, step: 0.5, def: 20 },
      { key: 'dish', label: 'Dish depth', min: 0, max: 10, step: 0.5, def: 4 },
      { key: 'dishInset', label: 'Rim width (edge to dish wall)', min: 8, max: 40, step: 0.5, def: 15 },
      { key: 'edgeT', label: 'Edge thickness', min: 6, max: 40, step: 0.5, def: 12 },
      { key: 'underR', label: 'Underside curve starts at radius', min: 60, max: 280, step: 1, def: 170 },
      { key: 'underP', label: 'Underside curve shape', min: 1, max: 3, step: 0.1, def: 1.8, unit: '' },
      { key: 'edgeR', label: 'Edge round-over radius', min: 0, max: 6, step: 0.5, def: 3 },
      { key: 'sheetW', label: 'Oak sheet width', min: 300, max: 1200, step: 1, def: 600 },
      { key: 'sheetL', label: 'Oak sheet length', min: 300, max: 2000, step: 1, def: 800 },
    ],
  },
  {
    id: 'hub', label: 'Upper hub', params: [
      { key: 'hubH', label: 'Height above the dish', min: 40, max: 200, step: 1, def: 90 },
      { key: 'hubTopD', label: 'Top diameter', min: 16, max: 60, step: 0.5, def: 33 },
      { key: 'hubBaseD', label: 'Foot diameter', min: 40, max: 180, step: 1, def: 105 },
      { key: 'hubFoot', label: 'Foot edge height', min: 0.5, max: 6, step: 0.5, def: 1.5 },
      { key: 'hubK', label: 'Flare curve', min: 1, max: 5, step: 0.1, def: 2.6, unit: '' },
    ],
  },
  {
    id: 'nub', label: 'Lower nub', params: [
      { key: 'nubL', label: 'Length', min: 20, max: 120, step: 1, def: 55 },
      { key: 'nubTopD', label: 'Top diameter', min: 20, max: 80, step: 0.5, def: 40 },
      { key: 'nubTipD', label: 'Tip diameter', min: 14, max: 40, step: 0.5, def: 18 },
      { key: 'nubK', label: 'Taper curve', min: 0.5, max: 4, step: 0.1, def: 1.6, unit: '' },
    ],
  },
  {
    id: 'joint', label: 'Joints', params: [
      { key: 'holeD', label: 'Bore through the wood', min: 10, max: 14, step: 0.5, def: 11 },
      { key: 'tenonD', label: 'Tenon diameter', min: 16, max: 50, step: 0.5, def: 30 },
      { key: 'tenonH', label: 'Tenon / recess depth', min: 1, max: 8, step: 0.5, def: 3 },
    ],
  },
  {
    id: 'hang', label: 'Hanging', params: [
      { key: 'ceilingH', label: 'Ceiling height', min: 2200, max: 3500, step: 10, def: 2500 },
      { key: 'plateT', label: 'Ceiling plate height', min: 3, max: 40, step: 1, def: 10 },
      { key: 'plateD', label: 'Ceiling plate diameter', min: 40, max: 150, step: 1, def: 80 },
      { key: 'tubeN', label: 'Tubes', min: 1, max: 10, step: 1, def: 5, unit: '' },
      { key: 'tubeL', label: 'Tube length (body)', min: 50, max: 1000, step: 1, def: 300 },
      { key: 'tubeGap', label: 'Extra length per joint', min: 0, max: 30, step: 0.5, def: 0 },
      { key: 'tubeD', label: 'Tube diameter', min: 8, max: 20, step: 0.5, def: 12 },
      { key: 'tubeEngage', label: 'Rod length inside last tube', min: 8, max: 40, step: 1, def: 20 },
      { key: 'pitch', label: 'Thread', options: [['1', 'M10×1 (lamp thread)'], ['1.5', 'M10×1.5 (standard)']], def: '1' },
    ],
  },
  {
    id: 'router', label: 'Router', params: [
      { key: 'bitD', label: 'Straight bit diameter', min: 6, max: 30, step: 0.5, def: 12 },
      { key: 'bitL', label: 'Straight bit cutting length', min: 10, max: 50, step: 1, def: 25 },
      { key: 'dishBitD', label: 'Dish bit diameter', min: 6, max: 30, step: 0.1, def: 12.7 },
      { key: 'maxPass', label: 'Max depth per pass', min: 1, max: 6, step: 0.5, def: 3 },
      { key: 'ringStep', label: 'Ring width (≤ bit)', min: 3, max: 30, step: 0.5, def: 10 },
      { key: 'baseD', label: 'Router base diameter', min: 100, max: 220, step: 1, def: 150 },
      { key: 'sledT', label: 'Sled board thickness', min: 4, max: 18, step: 0.5, def: 9 },
    ],
  },
];

export const ALL = GROUPS.flatMap(g => g.params);
export const DEFAULTS = Object.fromEntries(ALL.map(p => [p.key, p.def]));
const BY_KEY = Object.fromEntries(ALL.map(p => [p.key, p]));

const STORE = 'toupy.params.v1';

function coerce(key, raw) {
  const p = BY_KEY[key];
  if (!p) return undefined;
  if (p.options) return p.options.some(o => o[0] === String(raw)) ? String(raw) : undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(p.max, Math.max(p.min, n));
}

export function fromHash(hash) {
  const out = {};
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  for (const [k, v] of q) {
    const c = coerce(k, v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

export function toHash(params) {
  const q = new URLSearchParams();
  for (const p of ALL) if (String(params[p.key]) !== String(p.def)) q.set(p.key, params[p.key]);
  const s = q.toString();
  return s ? '#' + s : '';
}

export function load() {
  const fromUrl = fromHash(location.hash);
  if (Object.keys(fromUrl).length) return { ...DEFAULTS, ...fromUrl };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    const clean = {};
    for (const k in saved) { const c = coerce(k, saved[k]); if (c !== undefined) clean[k] = c; }
    return { ...DEFAULTS, ...clean };
  } catch { return { ...DEFAULTS }; }
}

export function save(params) {
  try { localStorage.setItem(STORE, JSON.stringify(params)); } catch { /* private mode */ }
  const h = toHash(params);
  history.replaceState(null, '', h || location.pathname + location.search);
}
