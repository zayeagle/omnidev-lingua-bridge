

## Archived 2026-07-18 08:58

---
version: 0.1.0
artifact: 06-release-notes.md
date: 2026-07-18
---

# Release Notes â€?Lingua Bridge 0.1.0

## Highlights
- Chrome / Firefox extension scaffold (WXT + TypeScript)
- Options: OpenAI-compatible API Key / Base URL / models (local storage only)
- Zero-ops: valid Key auto-enables; popup master toggle
- Auto ZHâ†”EN page translation (viewport + scroll incremental)
- Video speech â†?caption overlay (in-page capture; DRM may degrade)
- CI: vitest + dual-browser build

## Install (local)
1. `npm install && npm run build` (or `build:firefox`)
2. Chrome: Load unpacked `.output/chrome-mv3`
3. Firefox: Load temporary add-on `.output/firefox-mv2`
4. Open Options â†?paste API Key â†?browse any page

## Known limits
- Some DRM/cross-origin videos cannot be captured
- Firefox target is MV2 in this WXT version
- Store submission packaging not automated yet (`npm run zip`)
