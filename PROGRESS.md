# Progress

The build brief is in [PROMPT.md](PROMPT.md). The single-file prototype is in `reference/bedside-sim.html`.

## Done

### Phase 0 — Scaffold

- Vite 8 + React 18.3 + TypeScript 6.0 (strict, `noUncheckedIndexedAccess`), with Vite `base` set to `/bedside-sim/`
- ESLint 10 flat config: typescript-eslint, react-hooks, react-refresh, `max-lines` 400. `src/engine/**` may not import React, Zustand, Zod, UI or content, and may not use `window`/`document`/`Math.random`/`Date.now`.
- Prettier, EditorConfig, LF line endings enforced through `.gitattributes`
- Vitest (`tests/unit`) and Playwright (`tests/e2e`, run against `vite preview`)
- GitHub Actions: `ci.yml` (lint, format check, unit tests, build, e2e) and `deploy.yml` (`actions/deploy-pages` on push to `main`)
- MIT licence, README skeleton with disclaimer, placeholder page using the prototype's design tokens

## Next

- **Phase 1:** engine core (types, seeded RNG, processes, pharmacology, coupling, rhythms, recorder, replay), Zod schemas, formulary, and `anaphylaxis-01.json` with the four acceptance tests

## Known issues

- TypeScript is pinned to 6.0.x because typescript-eslint 8 supports only `<6.1`. Move to TS 7 once typescript-eslint supports it.
