# squintle

I want one command that saves a full-page plate of a url and later checks the pixels against what I kept.

```
squintle https://example.com
```

A bare url is one sight, named from the host, at the stock apertures. Plates land straight on the ledge: `ledge/<host>/<aperture>.png`. No ledger.

A sheet is how I name more than one page, pick the apertures, and cover bits that move on purpose. `glance.sheet.json` is the shape. `capture-baseline` and `compare` read that file when you don't pass a path.

## install

Node 20 or newer. Chromium is a separate install.

```
npm install
npx playwright install chromium
npm test
npm run build
```

## commands

```
node dist/squintle.js <url>
node dist/squintle.js capture-baseline [sheet]
node dist/squintle.js compare [sheet]
node dist/squintle.js approve [ledger]
node dist/squintle.js help
```

`capture-baseline` stores that set under `<ledge>/kept`.

`compare` stores a fresh set under `<ledge>/fresh`, writes a blot under `<ledge>/blot` when a kept plate is there, and leaves `ledger.json` beside the ledge, one folio per sight and aperture. It also leaves `spread.html` there, grouped by sight and aperture, so I can look at kept, fresh, and the blot and wipe between kept and fresh.

`approve` reads the ledger you pass, or `ledger.json` when you don't, and copies every fresh plate from that run over the kept one.

## exit codes

`help` exits 0. An empty argv or a bad one exits 1.

A bare url and `capture-baseline` exit 0 when the plates land, and 1 when the sheet, the browser, or the page fails.

`compare` exits 1 when a kept plate is missing, the sizes disagree, or the changed fraction is over `driftLimit`. It exits 0 when every folio is inside the limit. When the fresh plates are on disk, the ledger and the spread are written whether that run passed or not.

`approve` exits 1 when the ledger or a fresh plate is missing.

## sheet

```json
{
  "driftLimit": 0.002,
  "ledge": "ledge",
  "sights": [{ "name": "example", "url": "https://example.com/" }],
  "apertures": [{ "name": "desk", "width": 1440, "height": 900 }],
  "veils": [{ "sight": "example", "selector": "[data-clock]" }]
}
```

`sights` is required. `name` is a plain token, no spaces or slashes, and it can't repeat. `url` is http or https.

`apertures` is optional. Left out, I use palm 390x844, lap 834x1112, and desk 1440x900. Names don't repeat. Width and height are whole pixels.

`veils` is optional. Each one is a sight plus a css selector. Before the shot I paint a flat box over every match, so that patch does not count.

`driftLimit` is optional, a fraction from 0 to 1. Default is 0.002.

`ledge` is optional, default `ledge`. Kept, fresh, and blot are directories inside it. `ledger.json` and `spread.html` are written in the parent of the ledge.

## porch

`porch/` is two copies of a small static site, `before/` and `after/`. The after pages move a link, change a heading and a color, and drop the picture on the front page. The clock changes too, and `porch/sheet.json` veils `[data-clock]` on `front`, so that box does not count.

`porch/serve.mjs` serves a directory. The sheet is aimed at `http://127.0.0.1:4173`.

```
node porch/serve.mjs porch/before 4173
node dist/squintle.js capture-baseline porch/sheet.json
```

Stop that process, serve `porch/after` on the same port, then:

```
node porch/serve.mjs porch/after 4173
node dist/squintle.js compare porch/sheet.json
```

I expect exit 1. Open `porch/spread.html` from that folder. The images are `ledge/...` next to the html.

`.github/workflows/plates.yml` installs, tests, builds, does that swap, and uploads `spread.html`, `ledger.json`, and `ledge/`. The job passes when compare exits 1. Unzip the artifact and open `spread.html` there. Same relative paths.

## limits

The spread points at the pngs with relative paths. Take `spread.html` somewhere else and the images break.

Plates of different sizes fail that folio. I leave them as shot.

A veil is the element's box at capture time. If the element moves or changes size, the box follows it, and the edge can still show up as drift.

Full-page shots. No clicks, no login.
