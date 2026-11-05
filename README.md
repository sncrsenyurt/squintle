# squintle

I want one command that saves a full-page plate of a url and later checks the pixels against what I kept.

```
squintle https://example.com
```

A sheet is optional. `glance.sheet.json` is the shape: sights, apertures, veils, a drift limit, and the ledge where accepted plates go. A bare url, or `capture-baseline`, writes one full-page plate per sight and aperture under the ledge. compare should write a folio and a ledger and exit non-zero over the limit. compare and approve still stop after reading their arguments.

```
npm install
npm test
npm run build
node dist/squintle.js help
```
