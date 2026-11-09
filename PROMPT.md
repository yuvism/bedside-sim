# Bedside Sim — build brief for Claude Code

You are building **Bedside Sim**, an open-source, browser-based virtual patient simulator where a doctor talks to, examines, investigates and treats a patient whose physiology responds in real time. It must run from a GitHub Pages URL with no backend.

Read this whole file before writing code. Work phase by phase. Each phase has acceptance criteria — meet them before moving on.

---

## 1. How to work

- Start in plan mode: summarise your understanding, list the files you'll create in Phase 0–1, and wait for my "go".
- After each phase: run `npm run lint`, `npm run test` and `npm run build`. Fix every failure before continuing. Then commit with a clear message (`feat(engine): ...`, `feat(ui): ...`) and push.
- Keep a `PROGRESS.md` at the repo root: what's done, what's next, known issues. Update it at the end of each phase.
- If `reference/bedside-sim.html` exists, it is my working single-file prototype (anaphylaxis case, live ECG/pleth monitor, ABCDE exam, scoring). Use it as the reference for look, feel and the anaphylaxis model, then rebuild it properly in the new architecture.
- Prefer small, typed, testable modules. No file over ~400 lines.
- When a medical value (dose, threshold, rate) is uncertain, put it in data (not code), cite the source next to it, and add `"reviewNeeded": true`. Never invent a guideline citation.
- Ask me before adding any paid service, backend, or dependency over 200 kB gzipped.

## 2. What we're building and why

Benchmarks from existing products — match their core loop, keep it free and open:

- **Full Code** (mobile/web): 200+ physician-written cases, hundreds of possible actions per case, AI patient conversations for history taking, 3D environments, full score + debrief per case, and a case-authoring tool.
- **Body Interact** (desktop/web): real-time physiology engine where every decision, delay and error changes the patient; ABCDE exam; deterioration over time; dynamic cardiac arrest from untreated instability; adverse drug effects; ventilator + ABG physiology; scenario authoring.
- **Oxford Medical Simulation** (VR/screen): timeline-based debrief, performance metrics, multiplayer team roles, authoring tool that edits history, exam, physiology, results and feedback.
- **Steam medical sims** (Doctor Life Simulator, ER, Physician Simulator): game feel — diagnostic tools, time pressure, patient stories, unlockables.
- **Open-source engines**: Pulse Physiology Engine (Kitware, Apache-2.0, has a free Unity asset) and BioGears. Too heavy for this web build, but design the engine interface so a Pulse-backed engine can be swapped in later for the Unity version.
- **Infirmary Integrated** (open source): reference for realistic monitor waveforms and rhythm list.

Our differentiators: free, open-source, runs in a browser, cases are plain JSON anyone can author, and a **video validation mode** that compares a simulated run against a timeline annotated from a real treatment video (this is for my research project).

## 3. Tech stack

- Vite + React 18 + TypeScript (strict). Zustand for state. CSS Modules or vanilla CSS with custom properties (no Tailwind).
- Canvas 2D for monitor waveforms. Web Audio API for monitor beeps and alarms (generated tones, no audio files).
- Recharts for debrief charts.
- Zod for validating case JSON.
- Vitest for unit tests, Playwright for one end-to-end smoke test.
- ESLint + Prettier.
- Optional 3D in Phase 7 only: `@react-three/fiber` + `@react-three/drei`, with CC0 assets only (e.g. Kenney, Quaternius). Credit them in `ASSETS.md`.

## 4. Architecture

```
src/
  engine/            # pure TypeScript, zero React imports — portable to C#/Unity
    types.ts         # Vitals, PatientState, Action, SimEvent, Rhythm
    engine.ts        # PhysiologyEngine interface + SimpleEngine implementation
    processes.ts     # disease processes (severity 0–100, progression, effects)
    pharmacology.ts  # one-compartment PK + Emax effect per drug
    coupling.ts      # baroreflex, oxygenation, perfusion→consciousness, rhythm transitions
    rhythms.ts       # rhythm state machine
    rng.ts           # seeded RNG (deterministic runs, replays, tests)
    scoring.ts       # rule evaluator for case scoring
    recorder.ts      # event log + vitals trace + export (JSON/CSV)
  content/
    cases/*.json     # one file per case
    formulary.json   # drugs: routes, standard doses, PK, effects, contraindications
    investigations.json
    schema.ts        # Zod schemas for all of the above
  ui/
    monitor/         # canvas waveforms, numerics, alarms, audio
    patient/         # avatar (SVG first), speech bubble, status chips
    panels/          # Talk, Examine, Investigate, Treat, Orders, Results
    debrief/         # score, checklist, timeline-over-vitals chart, teaching points
    editor/          # case authoring UI
    validation/      # video validation mode
  app/               # routes, layout, stores, settings
tests/
```

### Engine interface (keep exactly this shape so it can be ported)

```ts
interface PhysiologyEngine {
  load(caseDef: CaseDef, seed: number): void;
  step(dtSec: number): SimEvent[];          // fixed 1 s internal timestep
  apply(action: Action): SimEvent[];        // order, drug, procedure, device
  vitals(): Vitals;                          // hr, sbp, dbp, map, spo2, rr, etco2, temp, gcs, glucose, rhythm
  labs(): Record<string, number>;           // current lab truth (for result generation)
  snapshot(): EngineState;                  // serialisable, for save/replay
  restore(s: EngineState): void;
}
```

## 5. Physiology model (SimpleEngine)

Deterministic, explainable, data-driven. Not a full physiological model — a believable teaching model.

1. **Baseline** vitals per patient (age/weight-adjusted).
2. **Processes** (e.g. `anaphylaxis`, `bronchospasm`, `hypovolaemia`, `sepsis`, `myocardial_ischaemia`, `tension_ptx`, `opioid_toxicity`, `dka`, `hyperkalaemia`, `raised_icp`): each has `severity` 0–100, a progression rate (per minute, can decay over time), and linear or curved effects on vitals and labs per point of severity. Treatments reduce severity or block effects.
3. **Pharmacology**: each dose adds to a compartment; concentration decays with the drug's half-life; effect = Emax × C / (EC50 + C) on named targets (e.g. adrenaline → anaphylaxis severity ↓, HR ↑, SBP ↑). Wrong route or dose scales effect and can trigger adverse events defined in the formulary (e.g. IV bolus adrenaline outside arrest → hypertension + ventricular ectopy).
4. **Devices & procedures**: oxygen (nasal cannula, Venturi, non-rebreather, BVM, intubation + ventilator with FiO2/PEEP/RR/TV), IV/IO access, fluid bolus (rate-limited), CPR, defibrillation/cardioversion, needle decompression, chest drain.
5. **Coupling**: compensatory tachycardia when MAP falls; SpO2 from FiO2 and a shunt term driven by respiratory processes; EtCO2 from RR/ventilation; GCS from MAP, SpO2, glucose; urine output from MAP.
6. **Rhythm state machine**: sinus, sinus tachy, sinus brady, AF, SVT, VT (pulsed/pulseless), VF, PEA, asystole, STEMI pattern. Transitions driven by thresholds (severity, K+, hypoxia, drug effects, shocks) with seeded randomness.
7. **Cardiac arrest mode** when any process hits 100 or rhythm becomes non-perfusing: ALS loop with 2-minute CPR cycles, rhythm checks, shockable vs non-shockable branches, ROSC probability tied to quality and timing of interventions and whether the reversible cause was fixed.
8. Small noise on numerics from the seeded RNG. Same seed + same actions = identical run.

## 6. Features by phase

### Phase 0 — Scaffold
Vite + React + TS strict, lint, Prettier, Vitest, Playwright, GitHub Actions CI (lint/test/build on push), Pages deploy workflow, MIT licence, README skeleton with disclaimer, `PROGRESS.md`.
**Accept:** `npm run dev` shows a placeholder; CI is green.

### Phase 1 — Engine core + one case
Engine interface, SimpleEngine, seeded RNG, recorder, Zod schemas, formulary with the drugs this case needs, and `anaphylaxis-01.json` ported from the prototype.
**Accept:** unit tests prove (a) untreated case arrests within 10–18 sim min, (b) IM adrenaline at 2 min drops severity and raises SBP within 3 min, (c) adrenaline wears off and a second dose is needed in most seeds, (d) same seed + actions → identical trace.

### Phase 2 — Bedside UI
- Monitor: ECG + SpO2 pleth + capnography + arterial line (when placed) on canvas; HR, SpO2, NIBP (cycle every 3 min or on demand), RR, EtCO2, temp; alarm limits with colour + audio; beep pitch falls as SpO2 falls; mute button.
- Patient: SVG avatar showing flushing, hives, cyanosis, sweating, lip swelling, eyes closed, breathing effort; speech bubble.
- Panels: **Talk** (structured questions by category: presenting complaint, history, PMH, meds, allergies, social, family, ICE), **Examine** (ABCDE plus head-to-toe by clicking body regions), **Investigate** (bedside tests instant, labs and imaging with realistic turnaround times in sim minutes, results inbox with unread badges), **Treat** (searchable formulary with route + dose picker and a "standard dose" shortcut, devices, procedures).
- Event log with timestamps. Clock with pause and 1×/2×/4×/8× speed.
- Responsive to 375 px wide, keyboard accessible, light/dark themes.
**Accept:** the anaphylaxis case is fully playable end to end; Playwright smoke test plays it to a stabilised outcome.

### Phase 3 — Debrief and scoring
- Rule-based scoring from case JSON: `actionWithin`, `actionBefore`, `actionNever`, `examined`, `asked`, `diagnosisIs`, `outcomeIs`, `vitalNeverBelow` etc. Weighted, with critical-fail rules.
- Debrief screen: score, outcome, checklist (done/missed/harmful), vitals chart over time with action markers on the timeline, teaching points, references, "replay from minute X".
- Export JSON and CSV of events + vitals trace (copy-to-clipboard and file download).
- Local progress history (localStorage): best score per case, attempts.
**Accept:** scoring rules unit-tested; debrief chart shows action markers aligned to the vitals.

### Phase 4 — Case library (10 cases)
Write each as JSON with history, exam findings by severity band, investigations, process config, scoring rules, teaching points and references:

1. Anaphylaxis (adult) — Resuscitation Council UK 2021
2. Acute severe asthma — BTS/SIGN
3. STEMI with VF arrest risk — ESC / AHA ACLS
4. Septic shock (pneumonia) — Surviving Sepsis Campaign
5. Diabetic ketoacidosis — JBDS
6. Hypoglycaemia with reduced GCS
7. Opioid overdose — naloxone titration, airway
8. Tension pneumothorax after trauma — ATLS-style primary survey
9. Haemorrhagic shock (trauma) — permissive hypotension, blood products, TXA
10. Hyperkalaemia with ECG changes — UK Kidney Association

Add a case select screen: specialty filter, difficulty, estimated time, best score.
**Accept:** every case validates against the schema, has at least 8 scoring rules, and has an automated "ideal run" test that reaches a good outcome and a "do nothing" test that reaches a bad one.

### Phase 5 — Team and realism
- A nurse who receives orders and executes them after a realistic delay (IV access 60–120 s, drug draw-up 30–60 s), reads them back (closed-loop communication), and can refuse unsafe orders with a reason ("He's allergic to penicillin — do you still want it?").
- Allergies and contraindications in the formulary trigger warnings or adverse events.
- Modes: **Guided** (hints after inactivity, nurse prompts) and **Exam** (no hints, hidden severity, OSCE-style score).
- Random case variations from the seed: age, weight, starting severity, comorbidity, which question reveals the key clue.
- Patient deteriorates or improves visibly; spontaneous patient lines at thresholds.
**Accept:** delays and refusals unit-tested; exam mode hides hints.

### Phase 6 — AI patient conversation (optional, off by default)
- Free-text "Ask the patient anything" box.
- Without an API key: keyword/intent matcher over the case's dialogue entries (works offline).
- With a key the user pastes in Settings (stored only in localStorage, never committed, clear warning shown): call the Anthropic Messages API from the browser (requires the `anthropic-dangerous-direct-browser-access: true` header). Model name configurable in Settings.
- The patient system prompt is built from the case JSON only: persona, what they know, how severity changes speech (short, breathless, confused, unresponsive). The patient must never reveal the diagnosis, lab values or anything not in the case file — answer "I don't know" instead.
- Every free-text question is mapped back to a dialogue ID (if any) so scoring still works.
**Accept:** offline matcher tested; app works fully with no key.

### Phase 7 — Optional 3D bedside view
Toggle between 2D panel view and a low-poly 3D resus bay (bed, monitor screen mirroring the canvas, IV pole, crash cart, patient built from primitives or a CC0 model). Clicking objects opens the matching panel. Must not drop below 30 fps on a mid-range laptop; 2D stays the default.

### Phase 8 — Case editor
Form-based editor for every field in the case schema, live Zod validation, "test run" button, import/export JSON, duplicate an existing case. Store drafts in localStorage.
**Accept:** a new case built only in the editor is playable.

### Phase 9 — Video validation mode (research feature)
For comparing the simulation against a real treatment video:
- Import a reference CSV annotated from a video: `t_sec, hr, sbp, dbp, spo2, rr, etco2, event` (event = free text or an action ID).
- Auto-build a replay script from the reference events (action IDs at their timestamps) and run the engine headless with the same seed.
- Overlay simulated vs reference curves per vital; show RMSE, mean absolute error, max deviation, and lag of key transitions (e.g. time from adrenaline to SBP > 90 in sim vs video).
- Flag where the sim diverges beyond a tolerance the user sets, and export a validation report (JSON + PNG of the charts).
- Include `docs/validation.md` explaining how to annotate a video into the CSV, with a sample file.
**Accept:** sample reference CSV loads, comparison renders, metrics unit-tested.

### Phase 10 — Unity port pack
Create `unity/` with C# files that mirror `src/engine/` one-to-one (`PhysiologyEngine.cs`, `SimpleEngine.cs`, `Processes.cs`, `Pharmacology.cs`, `Rhythms.cs`, `Recorder.cs`), loading the same case and formulary JSON from `StreamingAssets`. Add a `MonitorUI.cs` for uGUI numerics, a `README.md` explaining setup in Unity 2022 LTS or newer, and a note on swapping in the free Pulse Physiology Engine Unity asset behind the same interface. Add a parity test: run the anaphylaxis ideal-run script in TS, export the trace, and include it as a fixture the C# side can compare against.

## 7. Medical-safety rules

- Every screen footer and the README: "Educational simulation. Simplified physiology. Not clinical guidance."
- Doses and thresholds live in `formulary.json` and case files with a `source` field. Anything not directly from a named guideline gets `"reviewNeeded": true` and appears in `docs/clinical-review.md` for a clinician to check.
- Don't present a single "correct" answer where guidelines allow options; score the safe options equally.

## 8. Design direction

Clinical, calm, legible. The monitor is a real device: black screen, standard trace colours (ECG green, SpO2 cyan, BP red, RR/EtCO2 yellow). Everything else is a quiet scrub-teal on pale grey-green, Atkinson Hyperlegible for text, Barlow Condensed for numerics. One memorable element (the live monitor); keep the rest disciplined. Sentence-case labels, plain verbs on buttons ("Give adrenaline", not "Submit").

## 9. GitHub

- Repo name `bedside-sim`. If no remote exists, run `gh repo create bedside-sim --public --source=. --remote=origin --push` (I'm logged in with `gh auth login`).
- Vite `base` = `/bedside-sim/`. Deploy with the official `actions/deploy-pages` workflow on push to `main`.
- README: GIF/screenshot, live demo link, feature list, how to add a case, how to run locally, architecture diagram (Mermaid), disclaimer, credits (Pulse, BioGears, Infirmary Integrated as inspiration; CC0 asset credits).
- Add `CONTRIBUTING.md` (how to write a case), issue templates (bug, new case), and good-first-issue labels.

## 10. Definition of done

- 10 playable cases, all with ideal-run and do-nothing tests passing.
- Debrief with timeline chart and export works.
- Case editor creates a playable case.
- Video validation mode works with the sample CSV.
- Lighthouse accessibility ≥ 90 on the case screen.
- Live on GitHub Pages; CI green; `PROGRESS.md` up to date.
