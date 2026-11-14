# Bureaucracy Meme

A browser tool that drafts bilingual British-bureaucracy meme captions for an
original template or a local upload, then exports a PNG. A host page can embed
the same files in a frame.

## Run the page

```bash
npm start
```

Then open `http://localhost:8080/`.

Captions need a host desk that offers the `bureaucracyMeme.captions` service
(the desk builds any model route from its own Control Panel). On this page
alone that service answers unavailable, and the tool shows the same “working
language model required” message it shows when no model is available.

## What a host needs

| Need | Detail |
| --- | --- |
| Bridge | Protocol 1 (`ais6-bridge.js`); capabilities `services`, `files`, `appearance`, `snapshot` |
| Service | `bureaucracyMeme.captions` with params `{ topic, tone, templateId, mood, imageDataUrl }` → `{ captions, provider, model }` or `{ ok: false, reason }` |
| Files | `files.export` for the finished PNG |
| Templates (optional) | Same-origin `GET /data/bureaucracy-templates.json`; without it the three bundled originals are used |
| Pictures (optional) | Same-origin `/assets/bureaucracy/*.svg` when the JSON names those URLs; the app also ships copies under `assets/` |

## Build

```bash
npm run build
```

Copies what a host embeds into `dist/` (the app tree file for file). There are
no dependencies; Node is enough.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `main.js`, `bureaucracy-meme.js`, `bureaucracy-meme.css` | The page, the feature, and its stylesheet |
| `strings-en.js`, `strings-zh.js` | English and Chinese string tables |
| `shared/` | Base styles and the runtime that talks to the bridge |
| `assets/` | Three original fictional template SVGs |
| `ais6-bridge.js`, `kit.css`, `app.manifest.json` | Let a host page embed the tool in a frame, export the PNG and draw its menus; on its own page the same calls fall back to downloads and local appearance |
| `tools/build.mjs` | Copies the embed tree into `dist/` |

## Licence

MIT. See [LICENSE](LICENSE). Asset licences: [LICENSES.md](LICENSES.md).

中文：[README.zh-CN.md](README.zh-CN.md).
