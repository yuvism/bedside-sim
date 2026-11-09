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

### Phase 2 — Bedside UI

- **App shell:** hash router (`#/` case list, `#/case/<id>?seed=N`; a missing seed is filled in so every run can be replayed from its URL), Zustand store (`src/app/store.ts`) around a framework-free `Session` (`src/app/session.ts`: engine + recorder + NIBP cycling + results inbox + speech bubble), a 250 ms sim loop, pause and 1×/2×/4×/8×, light/dark/auto theme toggle
- **Monitor (`src/ui/monitor/`):** sweep-style canvas with ECG (rhythm-aware: ectopics, VF, PEA, AF, ST elevation), SpO₂ pleth scaled by perfusion, capnogram with a bronchospasm "shark fin", and an arterial trace once a line is placed. Numerics for HR, SpO₂, NIBP (auto every 3 min plus "Take NIBP now"), ART, RR, EtCO₂ and temp. Alarm limits graded medium/high, shown in colour, announced politely to screen readers and sounded with Web Audio. The pulse beep pitch falls with SpO₂. Mute and 2-minute alarm silence.
- **Patient (`src/ui/patient/`):** SVG avatar driven by engine signs (flush, hives, lip swelling, cyanosis, sweating, breathing effort with RR-paced animation, eyes closed), a plain-language description for screen readers, a speech bubble and intervention chips
- **Panels (`src/ui/panels/`):** Talk grouped by history category; Examine with ABCDE plus a head-to-toe body map with matching buttons; Investigate with bedside/lab/imaging turnaround times, "due in" countdowns and a results inbox with unread badges; Treat with team, oxygen/position, access/procedures (IV, IO, arterial line), fluids and a searchable formulary with route picker, dose input and a "Standard dose" shortcut
- **Event log**, working-diagnosis picker, end-case button and a temporary end dialog (the full debrief comes in Phase 3)
- **Content:** head-to-toe regions added to `anaphylaxis-01`, and an `art_line` procedure in `devices.json`
- **Tests:** unit tests for alarms, waveform shapes, the router and the session. The Playwright test plays `anaphylaxis-01` to "Arjun is stable" using a fake clock, and a 375 px layout check confirms no sideways scrolling.

### Phase 3 — Debrief and scoring

- **`src/engine/scoring.ts`** (pure TS): evaluates case rules `actionDone`, `actionWithin`, `actionBefore`, `actionNever`, `actionCount`, `examined`, `asked`, `diagnosisIs`, `outcomeIs`, `vitalNeverBelow`/`vitalNeverAbove`, `rulePassed`/`ruleFailed` and `all`/`any`/`not`, with `*` wildcards on event codes. Credits add weight and penalties subtract it. A failed critical rule caps the score at 40. Teaching points are shown by the same tests.
- **Debrief** (lazy-loaded with Recharts, so it isn't in the main bundle): outcome, score, best score and attempt count, diagnosis vs expected, a checklist marked done/missed/harmful/avoided with timings, and a vitals chart as small multiples (HR, SBP, SpO₂, RR on one shared time axis, alarm limits dashed). Numbered action markers run through every panel, with a matching list underneath; harmful actions are marked in red. There's also a vitals table view, teaching points and references.
- **Export:** copy or download JSON (the full run), the vitals CSV (with an event-code column) and the events CSV
- **Replay from minute X:** the session checkpoints the engine every sim minute, and replay resumes paused with the earlier log and trace kept. Replaying without new actions retraces the original run exactly (tested).
- **Progress history** in localStorage (best, last, attempts per case), shown on the case list and in the debrief
- **Tests:** 11 scoring tests (every rule type, totals, the critical cap, teaching, an ideal anaphylaxis run scoring 100 and a do-nothing run scoring 0), chart-marker alignment, progress, and replay. The e2e test now checks the debrief and replay.
- Bundle: main 105 kB gz; debrief chunk 109 kB gz

### Phase 4 — Case library

- **Engine:** a real ALS loop (`src/engine/als.ts`). Arrest no longer ends the case. CPR, defibrillation (pads required), and rhythm/pulse checks; ROSC is a seeded chance shaped by CPR fraction, timing, whether the cause has been fixed, and adrenaline/amiodarone. VF decays to asystole, and death follows 15 minutes of continuous arrest. Shocks to non-shockable rhythms or to a patient with a pulse are flagged as harm.
- **More engine:** continuous infusions (mcg/kg/min, units/kg/h, ml/h) with range warnings; condition-driven process treatments (needle decompression that kinks after 15 min, chest drain, primary PCI, haemorrhage control, dialysis); fluids that act on processes per litre infused; assisted ventilation (bag-valve-mask, airway manoeuvres); new conditions (`procedure` with timing, `infusing`, `effect`, `cpr`, `drugGiven.forSec`); a policy-driven headless runner (`runPolicy`).
- **Content:** formulary v2 (24 drugs, 3 fluids including red cells and FFP), devices v2 (procedures grouped by category), investigations v2 (19 tests), and nine new cases:
  - asthma-01 (BTS/SIGN)
  - stemi-01 (ESC 2023 + ALS)
  - sepsis-01 (Surviving Sepsis 2021)
  - dka-01 (JBDS)
  - hypo-01 (JBDS)
  - opioid-01 (BNF/ALS)
  - tension-01 (ATLS)
  - haemorrhage-01 (ATLS, CRASH-2)
  - hyperk-01 (UK Kidney Association)

  Each has 10–13 scoring rules (credits, penalties, critical rules), teaching points and references.

- **UI:**
  - an ALS panel during arrest (CPR, energy and shock, rhythm check, adrenaline and amiodarone via IV or IO, down time and CPR fraction)
  - infusion start, titrate and stop in the drug picker
  - procedures grouped by access, airway, breathing, circulation and referrals
  - ECG morphology from engine signs (ST elevation, peaked T, broad QRS) and CPR artifact on the ECG and arterial trace
  - case list with specialty, difficulty and text filters plus best score and attempts
- **Tests (93 unit, 5 e2e):** each case has an "ideal clinician" policy (`tests/unit/cases/policies.ts`) that stabilises the patient in 8/8 seeds with a mean score ≥ 80, plus a do-nothing run that ends in death. There are also ALS and infusion engine tests, and e2e tests for the case filters and the ALS panel.

## Next

- **Phase 5:** a nurse who executes orders after realistic delays with closed-loop read-back and refuses unsafe orders; allergies and contraindications; Guided vs Exam modes; seeded case variations; spontaneous patient lines

## Design decisions to review

- **Arrest rhythm for anaphylaxis is PEA**, not VF as in the prototype, because anaphylactic arrest is usually non-shockable. This is flagged for clinical review.
- **IM adrenaline is absorbed from a depot** (absorption half-life 1 min) rather than acting instantly, so improvement starts within a minute and peaks at about 3 minutes.
- **ROSC model** constants are teaching parameters and are listed in `docs/clinical-review.md`. A shock within the first minute of monitored VF counts as full-quality (no no-flow penalty).
- **Time compression:** DKA, sepsis and hyperkalaemia resolve in tens of minutes rather than hours, so a case fits a teaching session. Every case process says so in its `source`.
- **Fluid boluses** run at up to 100 ml/min (a pressure bag) whatever the clinical context. JBDS-style "1 L over 1 hour" rates aren't modelled yet.
- **Ventilator settings** (FiO₂/PEEP/RR/TV) from the brief are not built yet. Bag-valve-mask ventilation covers assisted breathing for now.
- **Critical-fail cap:** a failed critical rule caps the score at 40/100 (`CRITICAL_CAP` in `scoring.ts`).
- **Debrief chart as small multiples** rather than one chart with several y-axes, so each vital keeps its own honest scale.

## Known issues

- TypeScript is pinned to 6.0.x because typescript-eslint 8 supports only `<6.1`. Move to TS 7 once typescript-eslint supports it.
- **Not pushed yet.** The repo github.com/yuvism/bedside-sim exists but is empty, because GitHub rejects workflow files from a token without the `workflow` scope. Commits are kept locally until the gh login has that scope (`gh auth refresh -h github.com -s workflow`), then `git push -u origin main`.
- Bundle sizes are under the 200 kB gzipped limit: the main bundle is about 135 kB (React, Zod and the ten bundled cases), and the lazy debrief chunk is about 109 kB (mostly Recharts). If the library grows much more, cases should load lazily.
