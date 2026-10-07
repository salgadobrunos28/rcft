# Relational Cartography (rcft)

Participatory generative cartography. Each visitor is asked to define in a single word what a border is; every answer becomes a node in a drifting field. The work adopts the visual grammar of data and surveillance systems while refusing their function.

Bruno Mesquita, 2026. p5.js, screen, steel.

Live: https://salgadobrunos28.github.io/rcft/ (embedded at https://rcft.cargo.site)

## Structure

```
index.html          the cartography
contribute.html     the contribution form
css/rcft.css        all styles
js/config.js        endpoints and timings (the file you normally edit)
js/data.js          reading, normalising and caching responses
js/sketch.js        p5.js sketch
js/contribute.js    form submission and confirmation
apps-script/Code.gs single Apps Script endpoint for reading and writing (optional upgrade)
cargo/embed.html    iframe snippet and CSS for the Cargo pages
vendor/             p5.js 1.9.0 (LGPL-2.1) and qrcode-generator 1.4.4 (MIT)
```

## URL parameters

| Parameter | Effect |
|---|---|
| `?mode=install` | installation mode: no cursor, no button, QR code to the form |
| `?scale=1.5` | scales text, nodes and lines (large screens) |
| `?qr=0` / `?qr=1` | hide or show the QR code |

Example for the exhibition screen: `https://salgadobrunos28.github.io/rcft/?mode=install&scale=1.5`

## Keys

`space` pause drift, `r` refresh data, `d` diagnostics panel, `f` fullscreen.

## Behaviour

- New responses are merged into the existing field every 30 seconds. Existing nodes keep their position; new words appear with a short ring.
- The last valid dataset is cached in the browser. If the network or the Apps Script fails, the field keeps showing the cached corpus. It never falls back to invented data.
- Text panels are HTML and act as exclusion zones: nodes and labels stay out of them, edges pass underneath.
- The form sends all six fields and only thanks the participant once the response is found in the data (legacy mode) or confirmed by the script (post mode).

## Apps Script upgrade

`apps-script/Code.gs` replaces the current read and write deployments with one endpoint. Its GET returns only timestamp, country and word, so the long answers are no longer published. Deployment steps are at the top of the file; afterwards set `READ_URL` and `WRITE_URL` to the new `/exec` address and `WRITE_MODE` to `"post"` in `js/config.js`.
