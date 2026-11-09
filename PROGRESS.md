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

### Phase 1 — Engine core + anaphylaxis case

**Engine (`src/engine/`, pure TypeScript):**

- `engine.ts`: the `PhysiologyEngine` interface exactly as in the brief, a `BedsideEngine` extension for UI read-outs (signs, severities, status), and `SimpleEngine` with fixed 1 s ticks
- `model.ts`: sums effects from processes, drugs, fluids, devices and transients, then computes vitals, labs and signs
- `processes.ts`: severity 0–100 with a decaying drive, recovery, seeded variation, per-point effects with thresholds, curves and blockable groups
- `pharmacology.ts`: one-compartment PK with a first-order absorption depot per route, and Emax effects normalised to 70 kg
- `coupling.ts`: baroreflex, alveolar gas equation + V/Q gradient + Severinghaus curve + shunt mixing, PaCO₂/EtCO₂, pH from Henderson–Hasselbalch, GCS from MAP/SpO₂/glucose, urine output
- `rhythms.ts`: rhythm state machine (HR-driven sinus family, latched rule-driven rhythms with seeded probability)
- `actions.ts`: drugs (route/access checks, dose-range warnings, adverse rules), fluids, devices, procedures, talk, exam, orders with turnaround, diagnosis, call for help
- `conditions.ts` and `narrative.ts`: a small serialisable condition language, severity bands and `{placeholder}` templates for case text
- `rng.ts` (mulberry32 + OU noise), `recorder.ts` (trace every 15 s, JSON/CSV export), `replay.ts` (headless `runScript`)

**Content (`src/content/`):** Zod 4 schemas type-checked against the engine interfaces, cross-reference validation (`validate.ts`), `formulary.json` (adrenaline, chlorphenamine, hydrocortisone, salbutamol, crystalloid), `devices.json`, `investigations.json` and `cases/anaphylaxis-01.json` ported from the prototype. `npm run review:build` generates `docs/clinical-review.md` (28 flagged items plus the coupling constants), and a unit test fails if that file is stale.

**Acceptance (50 seeds, `tests/unit/engine/anaphylaxis.test.ts`):**

- (a) untreated arrest at 11.7–16.9 sim minutes ✓
- (b) IM adrenaline at 2:00 lowers severity and raises SBP by 5:00 in every seed ✓
- (c) a single dose never stabilises, and severity rebounds as it wears off. With a second dose at 7:00, every seed stabilises (11–20 min) ✓
- (d) same seed + script gives identical trace, events and final state; snapshot/restore resumes identically ✓

## Next

- **Phase 2:** bedside UI: monitor (ECG, pleth, capnography, arterial line; alarms and audio), SVG avatar, Talk/Examine/Investigate/Treat panels, event log, clock and speed, responsive and accessible; a Playwright test that plays to a stabilised outcome

## Design decisions to review

- **Arrest rhythm for anaphylaxis is PEA**, not VF as in the prototype, because anaphylactic arrest is usually non-shockable. This is flagged for clinical review.
- **IM adrenaline is absorbed from a depot** (absorption half-life 1 min) rather than acting instantly, so improvement starts within a minute and peaks at about 3 minutes.
- **The ALS loop** (CPR cycles, shocks, ROSC) is deferred to Phase 4 with the STEMI/VF case. Until then, arrest ends the case.
- **The scoring rules** are stored in the case file now and evaluated from Phase 3.

## Known issues

- TypeScript is pinned to 6.0.x because typescript-eslint 8 supports only `<6.1`. Move to TS 7 once typescript-eslint supports it.
- Not pushed yet: the GitHub repo hasn't been created (waiting for the go-ahead), and the gh token needs the `workflow` scope before workflow files can be pushed.
