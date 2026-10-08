# Relational Cartography (rcft)

Relational Cartography is a generative system that traces the shifting relations between words, people and territories. The work invites each visitor to define in a single word what a border is. Every answer becomes a node in a drifting field, where meanings move closer and apart without settling into a definition.

Bruno Mesquita, 2026. p5.js, screen, steel.


## Structure

```
index.html          the website: cartography inside a map sheet (frame, cartouche, latest entries)
contribute.html     the contribution form, same sheet system, map running faintly behind
install.html        the installation screen, same sheet system (opened through installation.html)
installation.html   entry point for the installation screen
lab.html            formal variations (not public)
css/rcft.css        base styles and installation layout
css/ui.css          website interface (map sheet) and form
css/install.css     installation layout on top of ui.css
js/ui.js            graduated frame, live totals and table rows (website and installation)
js/config.js        endpoints and timings (the file you normally edit)
js/data.js          reading, normalising and caching responses
js/sketch.js        p5.js sketch
js/contribute.js    form submission and confirmation
apps-script/Code.gs single Apps Script endpoint for reading and writing (optional upgrade)
cargo/embed.html    iframe snippet and CSS for the Cargo pages
vendor/             p5.js 1.9.0 (LGPL-2.1), qrcode-generator 1.4.4 (MIT), Fragment Mono (OFL)
tools/              bump-version.sh
```

## URL parameters

| Parameter | Effect |
|---|---|
| `?scale=1.5` | scales text, nodes and lines (large screens) |
| `?scale=auto` | scales by the shorter side of the screen, 720 px = 1 (default in the installation) |
| `?qr=0` / `?qr=1` | hide or show the QR code |
| `?mode=install` | same as opening `installation.html` |
| `?flash=0` / `?flash=1` | turn the new-word flash off or on (on by default only in the installation) |

The installation uses the same map sheet as the website, with two blocks in the bottom corners: on the left the cartouche (title, totals, legend); on the right the five latest entries, the next entry and a QR code pointing to `QR_URL` in `js/config.js` (the questions page on rcft.cargo.site). There is no cursor and no button. When the form runs inside the Cargo page, it returns to `SITE_URL` after submitting.

The scale follows the screen on its own: on a 32" TV the text has the same physical size whether the TV is Full HD (scale 1.5) or HD (about 1.07). To force a value, add `?scale=` to the address. Turn off the TV's overscan ("Just Scan", "Screen Fit" or similar) so the frame is not cropped.

## Keys

`space` pause drift, `r` refresh data, `d` diagnostics panel, `f` fullscreen, `t` preview the flash.

## Behaviour

- New responses are merged into the existing field every 30 seconds. Existing nodes keep their position; new words appear with a short ring. In the installation, the first new word is born at the point announced as the next entry, its row in the table is inverted while the ring lasts, and a white full-screen flash fades out in under a second (at most one flash every 3 seconds).
- The last valid dataset is cached in the browser. If the network or the Apps Script fails, the field keeps showing the cached corpus. It never falls back to invented data.
- Text is transparent HTML over the canvas: nodes and edges stay visible underneath it, as in the original sketch.
- Every word is linked to every other by a straight line: solid when both answers come from the same country, dashed when not (`EDGES: "network"` in `js/config.js`). `EDGES: "path"` switches to one continuous curved line through the words in order of arrival (Catmull-Rom converted to cubic Bezier, `PATH_TENSION`); it was tested and set aside.
- Lines are drawn as independent short segments, as in the original sketch. A single long dashed path (`setLineDash`) proved several times slower in Chrome.
- The form sends all six fields with `keepalive` and waits only 1.5 seconds: if the request fails in that window (no network, for instance) the fields stay filled so the participant can try again; otherwise it thanks them and returns to the map, where the word appears at once from a local copy until the sheet confirms it.

## Updating

GitHub Pages publishes about a minute after each push, and browsers may keep the pages for up to ten minutes. Before committing a change, run `sh tools/bump-version.sh`: it raises the number in `version.json`, `window.RCFT_VERSION` and the `?v=` tags. Open pages, including the installation screen and the Cargo iframes, check `version.json` on load and every five minutes and reload themselves when a newer version exists.

## Apps Script

Reading and writing go through one endpoint, `apps-script/Code.gs`, deployed as the standalone project "rcft endpoint" (7 October 2026). GET returns only timestamp, country and word, cached for 20 seconds, so the long answers are not published; POST appends a row to the responses sheet. To change the script, edit it in the Apps Script editor and use Deploy, Manage deployments, Edit, New version, which keeps the `/exec` address. The earlier endpoints are still active and listed in `js/config.js`.
