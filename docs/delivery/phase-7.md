# Phase 7 — Hardening and launch

## 2. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-7.1|PWA installability: web app manifest, app metadata, service-worker registration, offline fallback, and cached card verification pages for previously opened cards|FR-096|—|—|done 2026-08-13 — native Next manifest route publishes install metadata and maskable-capable icons, locale layout registers `/sw.js`, service worker pre-caches the offline shell and brand assets, opened card verification pages are cached network-first for offline display, and constraint coverage proves manifest/registration/card-cache behavior|

## 3. Exit checks

- [x] Manifest exposes app name, start URL, standalone display mode, theme/background colors and icons
- [x] iOS-friendly web app metadata is present
- [x] Service worker is registered from the application shell
- [x] Offline fallback exists for navigation failures
- [x] Previously opened card verification pages can be served from cache
- [x] `pnpm verify`, `pnpm test:integration`, docs checks, and build pass
