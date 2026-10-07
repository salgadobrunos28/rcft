# Relational Cartography (rcft)

Relational Cartography is a generative system that traces the shifting relations between words, people and territories. The work invites each visitor to define in a single word what a border is. Every answer becomes a node in a drifting field, where meanings move closer and apart without settling into a definition.

Bruno Mesquita, 2026. p5.js, screen, steel.

- Website (web and mobile): https://salgadobrunos28.github.io/rcft/, embedded at https://rcft.cargo.site
- Installation: https://salgadobrunos28.github.io/rcft/installation.html, embedded at https://rcinstallation.cargo.site

## Structure

```
index.html          the cartography (website)
installation.html   the cartography in installation mode
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
| `?scale=1.5` | scales text, nodes and lines (large screens) |
| `?qr=0` / `?qr=1` | hide or show the QR code |
| `?mode=install` | same as opening `installation.html` |
| `?flash=0` / `?flash=1` | turn the new-word flash off or on (on by default only in the installation) |

Installation mode hides the cursor and the contribute button and shows a QR code (bottom left, above the legend) pointing to `QR_URL` in `js/config.js`.

Example for the exhibition screen: `https://salgadobrunos28.github.io/rcft/installation.html?scale=1.5`

## Keys

`space` pause drift, `r` refresh data, `d` diagnostics panel, `f` fullscreen, `t` preview the flash.

## Behaviour

- New responses are merged into the existing field every 30 seconds. Existing nodes keep their position; new words appear with a short ring. In the installation, a new word also triggers a white full-screen flash fading out in under a second (at most one flash every 3 seconds).
- The last valid dataset is cached in the browser. If the network or the Apps Script fails, the field keeps showing the cached corpus. It never falls back to invented data.
- Text is transparent HTML over the canvas: nodes and edges stay visible underneath it, as in the original sketch.
- Edges are drawn as independent short segments, as in the original sketch. A single long dashed path (`setLineDash`) proved several times slower in Chrome.
- The form sends all six fields and thanks the participant once Google has processed the submission; on a network error the fields stay filled so they can try again.

## Updating

GitHub Pages publishes about a minute after each push, and browsers may keep the pages for up to ten minutes. Before committing a change, run `sh tools/bump-version.sh`: it raises the number in `version.json`, `window.RCFT_VERSION` and the `?v=` tags. Open pages, including the installation screen and the Cargo iframes, check `version.json` on load and every five minutes and reload themselves when a newer version exists.

## Apps Script

Reading and writing go through one endpoint, `apps-script/Code.gs`, deployed as the standalone project "rcft endpoint" (7 October 2026). GET returns only timestamp, country and word, cached for 20 seconds, so the long answers are not published; POST appends a row to the responses sheet. To change the script, edit it in the Apps Script editor and use Deploy, Manage deployments, Edit, New version, which keeps the `/exec` address. The earlier endpoints are still active and listed in `js/config.js`.
