# Toupy

An interactive 3D blueprint for building a hanging tray table, after the
*Toupy* by Mademoiselle Jo: a turned wooden tray hanging from the ceiling on a brass bar.

**Live:** https://djui.github.io/toupy/

- 3D view with an explode slider, cut-away and hover info
- dimensioned section drawings of the tray, upper hub and lower nub
- 1:1 A4 templates (profile gauges for routing and turning)
- STL export per part
- bill of materials, cut layout on the oak sheet, router passes, lathe and hanging steps

Every dimension is a setting. Changes are saved in the link (`#trayD=400…`) and in the browser.

The defaults describe one build: a Ø440 × 20 mm oak tray, routed in stepped rings
with a sled that pivots on the centre bore; an upper hub and lower nub turned from
glued-up squares of the same sheet; 5 brass tubes Ø12 × 300 mm (M10×1); an M10 rod
clamping the three wood parts with an acorn nut; 2.50 m ceiling. The shapes are
traced from photos of the original, so treat them as a starting point.

## Run locally

Open `index.html` in a browser. The built script in `dist/` is committed, so
no server or build step is needed.

To change the code:

```bash
npm install
npm run dev     # rebuilds on save and serves at http://127.0.0.1:8000
npm run build   # minified dist/app.js — commit it
```

## Layout

- `src/params.js` — every setting with its range and default; link/browser storage
- `src/model.js` — the half-profiles (r, z) of each part and where everything sits
- `src/parts3d.js`, `src/scene.js` — three.js geometry and the viewer
- `src/drawings.js`, `src/templates.js` — SVG drawings in millimetres, A4 tiling
- `src/router.js`, `src/content.js` — routing plan, BOM, cut layout, steps
