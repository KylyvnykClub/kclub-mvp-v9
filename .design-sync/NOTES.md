# design-sync notes — kclub

- This is an APP repo, not a packaged DS: no dist, no build. The converter runs in
  synth-entry mode via a deliberately nonexistent `--entry ./dist/index.js` (the
  flag's walk-up sets the package root to the repo root; the missing file triggers
  synthesis from `cfg.srcDir`). Build command:
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./dist/index.js --out ./ds-bundle`
  (driver: `resync.mjs` with the same flags).
- `cfg.srcDir = src/components/ui` (23 shadcn files → 110 PascalCase exports;
  compound subcomponents like CardHeader/SidebarMenu* are legit API and ship
  floor cards).
- CSS is Tailwind 4, compiled per-build by `cfg.buildCmd` (tailwind CLI compile,
  then concat `.design-sync/fonts.css` on top into `.design-sync/.cache/ds-styles.css`,
  which is `cfg.cssEntry`) — run it BEFORE the converter on every re-sync.
- Fonts: Manrope + Oxanium come from next/font at runtime → `.design-sync/fonts.css`
  (committed) pulls them from Google Fonts and defines `--font-body`/`--font-heading`.
- Playwright: repo has none; `.ds-sync` npm-installs `playwright`/`playwright-core`
  1.62.x whose chromium build (1234) matches the machine cache in
  `%LOCALAPPDATA%/ms-playwright`.
- `cfg.provider = DsPreviewProvider` (from `.design-sync/preview-provider.tsx`,
  shipped via `extraEntries`): DialogContent reads next-intl context
  (`useTranslations("common")` for the close label) and throws without it.
- `cfg.extraEntries` includes `sonner` so `toast()` and `Toaster` share one store
  (a preview importing toast from the npm package got a second instance and the
  Toaster stayed empty). `[EXPORT_COLLISION] Toaster` warn is expected — kclub's
  styled Toaster wins, which is what we want.
- Sidebar preview uses `<Sidebar collapsible="none">` — the default variant is
  `fixed h-svh` and gets clipped by the capture crop regardless of viewport.
- LESSON: changing `cfg.provider`/`extraEntries` (preview-affecting config)
  clears ALL preview grades — batch such config changes BEFORE grading.
- Preview scope (owner, 2026-08-31): the 23 parent components are authored and
  graded good; the 87 subcomponent exports stay on floor cards.

## Known render warns

- `[RENDER_BLANK]`/bad on content-less containers is legitimate — they render
  empty without children by design (18): AlertDescription?, CardContent,
  CardFooter, CardHeader, DropdownMenuLabel, SidebarFooter, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenuItem,
  SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, TableCaption, TableCell, TableHead (see .render-check.json
  `bad` list — exactly the unauthored container subcomponents).
  2026-09-01: +2 of the same class from the breadcrumb port: BreadcrumbItem,
  BreadcrumbSeparator (bare <li> containers). Chart* subcomponents render fine
  (ChartStyle is a <style> tag and never flagged).
- `[RENDER_THIN] Toaster: rendered height 0px` — benign: sonner toasts are
  `position: fixed`, so measured layout height is 0 while the screenshot shows
  two complete toasts. Confirmed visually 2026-09-01.

- LESSON (2026-09-01): recharts cannot render inside the capture harness -
  ChartContainer's ResponsiveContainer measures 0x0 there (initialDimension
  never applies; the recharts-wrapper stays empty; no console errors). The live
  app is unaffected. The ChartContainer preview therefore draws its plot as a
  hand-authored SVG inside a div child - the div absorbs the width/height={0}
  props ResponsiveContainer clones onto its child, while ChartContainer, its
  classes and the config-derived --color-* variables render for real.

## Re-sync risks

- `ds-styles.css` (cssEntry) is generated and gitignored — a re-sync that skips
  `cfg.buildCmd` ships stale utilities for classes previews added since.
- Google Fonts `@import` in `.design-sync/fonts.css` is a network dependency at
  render time; offline capture falls back to system fonts.
- The synth entry re-scans `src/components/ui` — new shadcn files are picked up
  automatically (component count will move; expected drift, not an error).
- `.design-sync/conventions.md` names utility classes that exist in the COMPILED
  css — if the app stops using one (tailwind purges it), re-validate the header
  (standalone `tracking-[0.18em]` was already cut for this reason: it exists
  only inside `.kclub-brand-button` via @apply).
