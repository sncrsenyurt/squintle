# squintle

I want one command that saves a full-page plate of a url and later checks the pixels against what I kept.

```
squintle https://example.com
```

A sheet is optional. `glance.sheet.json` is the shape: sights, apertures, veils, a drift limit, and the ledge where plates go. A bare url writes one full-page plate per sight and aperture straight onto the ledge.

`capture-baseline` stores that set under `ledge/kept`. `compare` captures a fresh set under `ledge/fresh`, writes a blot under `ledge/blot` when a kept plate is there, and leaves `ledger.json` beside the ledge, one folio per sight and aperture. It exits non-zero when a kept plate is missing, the sizes disagree, or the drift is over the limit. `approve` reads the ledger you pass, or `ledger.json` when you don't, and copies every fresh plate from that run over the kept one.

```
npm install
npm test
npm run build
node dist/squintle.js help
```
