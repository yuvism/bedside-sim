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

### Phase 5 — Team and realism

- **Nurse** (`src/engine/team.ts`, pure TS):
  - Orders go through the nurse. She reads back every order at once (closed loop), then carries it out after a seeded delay from `src/content/team.json`: IV access 60–120 s, drug draw-up 30–60 s (10–20 s in arrest), infusions 60–120 s, fluids 30–60 s, devices 10–20 s, referrals 15–30 s, chest drain 3–5 min.
  - She queries unsafe orders until the clinician answers Cancel or Give it anyway: documented allergies, contraindications, doses more than twice the usual maximum, and IV orders with no access ("Shall I put a cannula in first?").
  - Orders that need a line wait for a cannula that's going in.
  - Talking, examining, diagnosing, CPR, shocks and pulse checks happen at once.
- **Allergies and contraindications** in the data:
  - Patients carry `allergies`, and drugs carry `allergyClasses` and `contraindications` (GTN with SBP < 90, KCl with K⁺ ≥ 5.5, opioids in acute asthma).
  - Giving a drug the patient is allergic to triggers an allergic reaction and a harm event.
  - Levofloxacin is added as the penicillin-allergy alternative in sepsis.
- **Guided vs Exam** (`src/engine/coach.ts`), chosen on the brief:
  - Guided: the nurse offers case hints after 60 s without an action and flags alarming vitals; teaching notes appear as you go, and a trend chip shows whether the patient is improving or worsening.
  - Exam: silent, with teaching notes hidden from the log, and the debrief shows an OSCE-style breakdown (assessment, diagnosis, management, safety) with a pass mark of 60% and no failed critical rule. Scoring rules can set a `domain`; otherwise it's inferred from the test.
- **Seeded case variations** (`src/engine/variation.ts`): age and weight ranges, plus optional variants that change allergies, baseline, starting severity, and which question reveals the key clue. Examples:
  - anaphylaxis: the patient doesn't know about his allergy, and the clue moves to what he ate
  - sepsis: a penicillin allergy in about 40% of runs
  - STEMI: diabetic
  - hypoglycaemia: worse kidney function

  Briefs use an `{age}` placeholder so they match the varied patient. The debrief names the variation.

- **Tests (107 unit, 7 e2e):** nurse delays (cannula 60–120 s, drug 30–60 s, arrest drugs 10–20 s), immediate clinician actions, allergy, contraindication, dose and access queries, confirm and cancel, cannula-first chaining and snapshot/restore; guided mode hints after idling, while exam mode shows no hints or teaching notes; variations are deterministic, in range and valid; OSCE domains. The e2e tests cover the nurse query flow and exam mode.

### Phase 6 — AI patient conversation

- **"Ask the patient anything"** box at the top of the Talk panel. Every typed question becomes a `talk` action with a dialogue id, or `null` when the case doesn't cover it, so scoring and replay treat it like a button press. The log shows the clinician's own words.
- **Offline matcher** (`src/engine/dialogue.ts`, pure TS): normalises and lightly stems the question, then scores each dialogue entry by its `keywords` (single words and phrases) plus words shared with the scripted question. Below the threshold it's unmatched, and the patient says they don't know, in the way they're talking in that severity band (non-verbal when most of that band's answers are).
- **Optional Claude patient** (`src/app/claudePatient.ts`, `patientPrompt.ts`, `patientChat.ts`):
  - Off by default. In Settings the user pastes their own Anthropic API key, chooses the model (default `claude-opus-5-5`) and turns it on. The key is kept only in this browser's localStorage, with a clear warning, and a Forget key button removes it.
  - The SDK (`@anthropic-ai/sdk`) is loaded lazily as its own chunk (about 84 kB gzipped), only when a question goes to Claude. It calls the API straight from the browser with `dangerouslyAllowBrowser`, which sends the `anthropic-dangerous-direct-browser-access` header.
  - The system prompt is built from the case file only: name, age, sex, occupation, persona, how unwell they are in the current band, and the scripted answers for that band. The diagnosis, labs, exam findings, results, brief and teaching points are never included. The patient is told to say they don't know anything else, and never to guess a diagnosis or result.
  - Structured output (a JSON schema) returns `reply` and `questionId`, an enum of the case's dialogue ids plus `none`, so every answer maps back to a dialogue id. Effort is `low` for a quick reply. The last six exchanges go along for continuity.
  - Refusal fallbacks are on: `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta. If Claude still declines, or the key, network or reply fails, the offline matcher answers and a notice explains why. In cardiac arrest no request is made.
  - The reply is stored on the action, so a run with Claude replays exactly.
- **Tests (164 unit, 8 e2e):** every scripted question in all ten cases matches itself, plus paraphrases and off-topic questions; band-appropriate unknown answers; free-text talk events, scoring and replay; the prompt for every case leaves out the diagnosis, brief, results, exam findings and teaching; request shape (model, effort, fallbacks, schema); reply parsing; a mocked client for success, refusal, unreadable output, a rejected key and a network failure; offline resolution never calls the API; settings storage. The e2e test asks typed questions with no key and checks the Settings warning.

### Phase 7 — Optional 3D bedside view

- **2D / 3D toggle** above the patient card. 2D stays the default, and the choice is remembered in this browser. In 3D, the low-poly resus bay replaces the 2D avatar; the monitor, speech bubble and intervention chips stay as they are.
- **Plain three.js, not React Three Fiber.** R3F + drei measured about 280 kB gzipped, over the 200 kB limit, while three.js alone is about 147 kB including the orbit controls and scene. You chose plain three.js. The 3D chunk loads only when someone switches to 3D; the main bundle is unchanged.
- **The bay** (`src/ui/bay/`), built entirely from three.js primitives, with no model files (see [ASSETS.md](ASSETS.md)):
  - A bed with a head section that tilts, a patient, a wall-mounted monitor, a drip stand, a crash trolley with a defibrillator, and oxygen and suction outlets.
  - The monitor screen mirrors the live 2D waveform canvas plus the numbers, redrawn 12 times a second.
  - It follows the engine: sits up at about 30° and lies flat in arrest or with GCS ≤ 8 (eyes closed); breathes at the current RR; chest compressions at 110/min during CPR; skin colour from flushing, hives, pallor and cyanosis, and grey in arrest; oxygen mask, nasal cannula or bag-valve-mask; cannula on the arm; fluid bag and line while fluids or an infusion run; defibrillator pads on the chest.
  - Light and dark themes.
- **Clicking objects opens the matching panel:** patient's head → Talk, body → Examine, drip stand or oxygen outlet → Treat, trolley → Treat (or the ALS panel in arrest), monitor → scrolls to the full monitor. Hovering shows a label and highlights the object. A row of buttons does the same for keyboard and screen-reader users.
- **Performance:** about 70 low-poly meshes, Lambert materials, three lights, no shadows, pixel ratio capped at 1.5. It renders only while on screen (IntersectionObserver) and frees its WebGL context when switched off. It held 60 fps in headless Chromium on this machine. Dragging orbits within limits; zoom is off so the mouse wheel still scrolls the page, and on phones vertical swipes scroll the page.
- If WebGL isn't available or the 3D chunk fails to download, a message asks you to switch back to 2D.
- **Tests (178 unit, 11 e2e):** click targets and their panels, oxygen kinds, posture, eyes, drips, pads, skin colour mixing, breathing and compression timing, and the 3D monitor screen's numbers. The e2e tests check that 2D is the default; that the 3D canvas renders and reports a frame rate; that the object buttons open Treat, Examine and Talk; that a real click on the patient's torso and head in the scene opens Examine and Talk; that the choice is remembered; and that 3D fits a 375 px phone.

### Phase 8 — Case editor

- **Case editor** at `#/editor`, linked from the case list. Lazy-loaded, so it adds nothing to the main bundle (about 12 kB gzipped across two chunks).
- **Forms built from the Zod schema** (`src/ui/editor/form/`):
  - The editor reads `CaseSchema` at runtime and draws a form for whatever it finds: objects, lists (add, remove, reorder, duplicate), records (labs, variation answers), tuples (age range), enums, numbers with their bounds, and optional fields that can be added or removed.
  - Conditions and scoring tests (recursive unions) get a type picker with plain names ("Drug given", "Asked", "Action done within a time"), and fields shared by the old and new type are kept when you switch.
  - Every field in the schema is covered, and a unit test fails if a new top-level field isn't placed in a section.
  - Sections: basics, patient, brief, baseline and labs, disease processes, talk, examine, investigations, patient lines, outcome and diagnosis, scoring, teaching and hints, variation, and raw JSON.
- **Live validation:** the Zod schema runs on every change, and each problem shows under its field with a plain message ("Required.", "Needs at least 1."). Section tabs show problem counts, collapsed list items are marked, and a problems list jumps to the field. The cross-reference checks (unknown drug, device, process or question ids, one answer per band) run once the schema passes.
- **Suggestions** for id-like fields: drug, device, procedure and investigation ids from the shared library; process, question, exam, diagnosis and rule ids from the case; and action codes such as `talk:<id>`, `order:<id>` and `device:o2_nrb:on`.
- **Drafts** are saved automatically in localStorage, and a full storage is reported rather than failing silently. You can start from a new case, import a JSON file, duplicate a library case (saved as `<id>-copy`), duplicate a draft, export JSON or delete a draft.
- **New case template** (`src/content/templates/new-case.json`): a generic patient whose single process worsens until treated with high-flow oxygen. It is valid and playable as it stands, so authors can test-run straight away.
- **Test run** at `#/test/<draft>?seed=N` plays the draft at the bedside with a "Back to editor" link. Test runs aren't recorded in case progress.
- **Tests (196 unit, 13 e2e):** sections cover the schema exactly once; introspection builds valid starting values and recognises every condition and scoring-test type; all library cases and the template pass the editor's validation; field paths and messages; suggestions; routes; draft storage, including a full storage. The template is valid, stabilises with oxygen and arrests without it. **Acceptance:** an e2e test builds a case in the forms only (title, id, patient name, a new question with three answers, a new "Asked" scoring rule), test-runs it, asks the new question, gives oxygen, reaches "Alex is stable" and sees the new rule passed in the debrief. A second e2e test covers duplicate, export, import and jumping from a problem to its field.

### Phase 9 — Video validation mode (research feature)

- **Validation page** at `#/validate`, linked from the case list. Lazy-loaded (about 12 kB gzipped plus the shared Recharts chunk). Everything runs in the browser and nothing is uploaded.
- **Reference CSV** (`t_sec, hr, sbp, dbp, spo2, rr, etco2, event`, parsed in `src/engine/validation/csv.ts`): blank or NA cells mean "not observed", quoted cells, several events per cell with `;`, and `# case/seed/offset/source:` comment metadata. Problems are reported as warnings (bad numbers, ignored columns) or as clear errors (no `t_sec`, no rows).
- **Replay script** (`events.ts`): event ids use the engine's own log codes (`drug:adrenaline:IM[:dose]`, `device:o2_nrb:on`, `fluid:crystalloid[:ml]`, `infusion:<id>[:rate|stop]`, `procedure:`, `order:`, `talk:`, `exam:`, `dx:`, `help`, `cpr:on|off`, `shock[:J]`, `pulse_check`), checked against the library and the case, with standard amounts when none is given. Anything else stays as an annotation, with the reason it wasn't replayed. Actions are applied at their timestamps with no nurse delays, and the engine runs headless with the chosen seed and an optional time offset.
- **Comparison** (`metrics.ts`, `compare.ts`): the sim is sampled every second and matched to each reference observation. Per vital it reports RMSE, MAE, bias, maximum deviation (and when), and the share within tolerance; divergences are runs of consecutive points beyond tolerance. **Key transitions** give the time from an action (code prefix) to a vital crossing a threshold, in the video and in the sim, interpolated between readings, with the lag (sim − video). The first one is suggested automatically: first drug to SBP above 90.
- **UI:** case (library or a valid editor draft), seed, offset and per-vital tolerances; simulated (blue) and reference (orange, with dots) small multiples with shaded divergence, replayed-action lines and hover tooltips; an agreement table with ✓/⚠ results; a divergence list; an editable transitions list; an events table. The colours are the first two validated categorical slots, checked on this app's light and dark surfaces.
- **Exports:** a JSON report (inputs, events, metrics, divergences, transitions and the disclaimer) and a PNG of the charts, drawn on a canvas with print-friendly colours.
- **Docs:** [docs/validation.md](docs/validation.md) explains how to annotate a video (permission and de-identification first, choosing time zero and an offset, recording vitals and actions, double annotation), the CSV format, every metric and the limitations.
- **Sample:** `src/content/validation/anaphylaxis-01-sample.csv` is a **synthetic** example, labelled as such in the file, the page and the docs. It is built to differ from the sim in places so the flags and lag can be seen.
- **Tests (215 unit, 16 e2e):** the CSV parser (quotes, metadata, blanks, warnings, errors); event mapping and its explanations; offset scripting; RMSE, MAE, bias, maximum deviation and within-tolerance on hand-computed values; divergence grouping; threshold crossings with interpolation; the full sample run (replayed events, per-vital counts, a 162 s reference crossing, a positive lag, determinism); the report builder; tick and time formatting. The e2e tests load the sample (six charts, metrics, lag), change a tolerance and see the flag and report update, download a valid JSON and PNG, import a CSV with problems, and check 375 px.

### Phase 10 — Unity port pack

- **C# engine** in `unity/Assets/BedsideSim/Runtime/Engine/`, mirroring `src/engine/` file by file: `PhysiologyEngine.cs` (the `IPhysiologyEngine` contract), `SimpleEngine.cs`, `Processes.cs`, `Pharmacology.cs`, `RhythmRules.cs`, `Recorder.cs`, `Replay.cs`, plus coupling, conditions, actions, ALS, model, narrative, RNG and the data model. It is pure C# with no UnityEngine (`noEngineReferences` asmdef) and no packages: `Json.cs` is a small JSON reader, and `JsMath.cs` reproduces JavaScript rounding and number formatting.
- **Same JSON as the web app** in `unity/Assets/StreamingAssets/BedsideSim/` (library, ten cases and parity fixtures), kept in step by `npm run unity:sync`. A unit test fails when the copies or the fixtures are stale.
- **Unity components:** `SimulationRunner` loads a case from StreamingAssets, advances the engine with `Time.deltaTime × speed`, applies actions and raises events. `MonitorUI` shows the uGUI numerics (HR, SpO₂, cycled NIBP, RR, EtCO₂, temp, rhythm, clock) in the standard trace colours, with an alarm flash. [unity/README.md](unity/README.md) covers setup in Unity 2022 LTS or newer, Android/WebGL StreamingAssets, and swapping in the free Pulse Physiology Engine Unity asset behind `IPhysiologyEngine`.
- **Parity test:** `parity/anaphylaxis-01.json` is exported from the TypeScript engine with seed 1: the ideal-run script (stabilises at 12:19, 18 events, 740 one-second rows) and an untreated run (PEA arrest at 13:52, death at 28:52, 347 rows). The C# side replays both and requires every event (time, type, code and text) to match exactly and every sampled vital to match within 1 × 10⁻⁶. **Result: all 23 events and 9,783 values match, with the largest difference 1.4 × 10⁻¹⁴.** Corrupting one value or one character of an event makes it fail. It runs in Unity's Test Runner (Edit Mode) and as a .NET console app (`unity/ParityRunner`), which CI runs on every push. CI also compiles the Unity scripts against small API stubs.
- The engine and runner are built as **.NET Standard 2.1 at C# 9** with warnings as errors, the same API surface and language level as Unity 2022, so code that builds here builds in Unity. All ten cases load and run in C#.
- **Not ported yet:** scoring, the nurse, the coach, case variation, the free-text matcher (except its "I don't know" answer) and video validation. A Unity front end can add them on top of the engine.
- **Not tested in the Unity Editor itself**: there is no Unity install here. The engine is verified by the .NET parity run; the Unity scripts are checked by compiling against stubs, so a first run in the Editor should confirm the scene setup.

### Definition of done — finishing items

- **Accessibility:** Lighthouse 13.5 accessibility scores **100** on the case screen, the case list, the case editor and the validation page. axe-core (WCAG 2.1 A/AA plus best practice) during play found two issues the static run can't see, both now fixed: the small timestamp under an alarming NIBP was 3.78:1 against the alarm background (now full contrast, about 4.7:1), and the scrolling event log wasn't reachable by keyboard (now focusable, labelled "Event log"). The re-run is clean while running, at a nurse query, in cardiac arrest and in the 3D view, in light and dark and at 375 px; the debrief, editor and validation results were already clean.
- **README:** a hero screenshot and four feature screenshots (debrief, 3D view, case editor, validation) in `docs/images/`, "Add a case", a Mermaid architecture diagram, the full command list, accessibility results, and credits (Pulse, BioGears, Infirmary Integrated, three.js; no third-party assets per ASSETS.md).
- **CONTRIBUTING.md:** ground rules (no invented citations, `reviewNeeded`, score safe options equally), set-up and checks, the case format, disease processes, the condition language, scoring rules, and how to test a case.
- **Issue templates:** bug report (case URL with seed, exported run), new case (sources and every safe option required) and clinical review. Labels `new case` and `clinical review` were added on GitHub next to the default `bug` and `good first issue`.

## Next

- **Push, then go live:** the GitHub repo exists but is empty until the commits are pushed with a token that has the `workflow` scope. After that: enable GitHub Pages (source: GitHub Actions) and check that CI (web checks and the Unity parity job) and the deploy are green.

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
- **Not pushed yet.** The repo github.com/yuvism/bedside-sim exists but is empty, because GitHub rejects workflow files from a token without the `workflow` scope. Push with `gh auth login -h github.com -s workflow`, then `git push -u origin main` from the project folder.
- Bundle sizes are under the 200 kB gzipped limit: the main bundle is about 147 kB (React, Zod and the ten bundled cases), and the lazy chunks are about 109 kB for the debrief (mostly Recharts), 84 kB for the Anthropic SDK and 147 kB for the 3D view (three.js). If the library grows much more, cases should load lazily.
- The 3D view's frame rate was measured in headless Chromium only (60 fps), not yet on a mid-range laptop GPU.
- `npm audit` reports 10 moderate advisories, all in the lint tooling (minimatch, through ESLint and typescript-eslint). None are in code shipped to the browser.
- The AI patient was tested with a mocked client only. A live call needs a real key, which the project never stores.
