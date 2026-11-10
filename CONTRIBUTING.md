# Contributing to Bedside sim

> **Educational simulation. Simplified physiology. Not clinical guidance.**

Thanks for helping. The most valuable contributions are **new cases**, **clinical review** of the values flagged in [docs/clinical-review.md](docs/clinical-review.md), and bug reports with a case and seed that reproduce the problem.

## Ground rules

- **Never invent a citation.** Every medical number in the content carries a `source`. If a value isn't taken directly from a named guideline (doses, thresholds and timings tuned for teaching), say so in `source` and add `"reviewNeeded": true`. It then appears in `docs/clinical-review.md` for a clinician to check.
- **Score safe options equally.** Where guidelines allow more than one safe choice, the scoring rules should accept all of them (for example `drug:glucose_10:*` or `drug:glucagon:*`).
- Keep the disclaimer on every screen: _Educational simulation. Simplified physiology. Not clinical guidance._
- Be kind in issues and reviews.

## Getting set up

```bash
npm install
npx playwright install chromium   # once, for the end-to-end tests
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build && npm run test:e2e
```

Conventions:

- `src/engine/` is pure TypeScript: no React, Zod, DOM, `Math.random` or `Date.now` (ESLint enforces this), so it stays deterministic and portable to C#.
- No source file over about 400 lines (ESLint `max-lines`).
- Commit messages like `feat(cases): add pulmonary embolism case` or `fix(engine): …`.
- Ask before adding a dependency over 200 kB gzipped, a backend or a paid service.

## Writing a case

The quickest way is the **case editor** (Case editor on the case list): start from **New case** or duplicate a library case, edit it with forms, and **Test run** it at the bedside. Then **Export JSON** into `src/content/cases/<case-id>.json`. The editor validates everything below as you type.

A case file has these parts (the full schema is `src/content/schema.ts`; types are in `src/engine/caseTypes.ts`):

| Part                                | What it holds                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`, `title`, `summary`, …         | Identity and the case-list card. `{age}` in the brief is replaced with the patient's (varied) age.                       |
| `patient`                           | Name, age, sex, weight, persona (also feeds the optional AI patient), allergy classes.                                   |
| `baseline`, `labs`                  | Physiology at severity 0, and the starting labs.                                                                         |
| `processes`                         | Disease processes: severity 0–100, rate per minute, effects per severity point, treatments, arrest threshold.            |
| `bands`                             | Severity cut-offs that choose which answer the patient gives and how they talk.                                          |
| `dialogue`                          | Questions, one answer per band (text in (brackets) is non-verbal), and keywords for free text.                           |
| `exam`, `investigations`            | Findings and results as condition-dependent text with `{placeholders}` such as `{hr}` or `{glucose:1}`.                  |
| `patientLines`, `rhythmRules`       | Things the patient says when a condition first holds; rhythm changes.                                                    |
| `outcomes`                          | What "stabilised" means, and for how long it must hold.                                                                  |
| `diagnosis`                         | The correct diagnosis ids and the options offered.                                                                       |
| `scoring`, `teaching`, `references` | Scoring rules, teaching points (optionally shown only if a rule passed or failed), and references.                       |
| `hints`, `variation`                | Guided-mode nurse prompts; seeded variation (age and weight ranges, alternative allergies, answers, baseline, severity). |

### Disease processes

Each process has a severity from 0 to 100:

```
dS/dt = ratePerMin × e^(−t/decayTauMin) − recoveryPerMin × S + treatments
```

- **Effects** add `perPoint × (S − above)^exponent` to a target: a vital (`hr`, `sbp`, `dbp`, `rr`, `temp`, `glucose`, `gcs`, `etco2`), a gas-exchange term (`vq`, `shunt`, `ventLoss`), `lab:<name>` or `sign:<name>`. Effects in a `group` can be blocked by a drug with a `block:<group>` effect (for example salbutamol blocking bronchospasm).
- **Drugs** move a process through `process:<type>` effects in `formulary.json`; **fluids** through `process:<type>` per litre.
- **Treatments** in the case change the rate while a condition holds, for example `{ "id": "oxygen", "when": { "device": "o2_nrb" }, "ratePerMin": -4 }`.
- `arrestAt` and `arrestRhythm` say when and how the patient arrests.

### The condition language

Conditions appear in treatments, findings, results, patient lines, rhythm rules, hints and the stabilised outcome:

| Condition                                                                                    | True when                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `{ "severity": "<process>", "gte": 30, "lt": 65 }`                                           | The process severity is in range                       |
| `{ "vital": "spo2", "lt": 94 }`                                                              | A vital is in range (`lab` and `effect` work the same) |
| `{ "time": { "gte": 300 } }`                                                                 | Sim time in seconds                                    |
| `{ "drugGiven": "adrenaline", "route": "IM", "forSec": 300 }`                                | Given (by that route), at least that long ago          |
| `{ "procedure": "iv_access", "withinSec": 60 }`                                              | Done, and less than that long ago                      |
| `{ "device": "o2_nrb" }`, `{ "infusing": "insulin" }`                                        | A device is on; an infusion is running                 |
| `{ "access": "iv" }`, `{ "arrest": true }`, `{ "cpr": true }`, `{ "rhythm": ["vf", "pvt"] }` | As named                                               |
| `{ "all": [ … ] }`, `{ "any": [ … ] }`, `{ "not": { … } }`                                   | Combinations                                           |

### Scoring rules

Each rule has a `weight`, a `kind` (`credit` adds the weight when passed, `penalty` subtracts it when failed), an optional `critical` flag (a failed critical rule caps the score at 40) and a `test`:

- `actionDone`, `actionWithin` (`withinSec`), `actionBefore` (`before`), `actionNever`, `actionCount` (`min`, `max`) over action codes such as `drug:adrenaline:IM`, `order:glu`, `talk:allergy`, `exam:A`, `device:o2_nrb:on`, `procedure:iv_access`, `fluid:crystalloid` or `dx:<id>`; `*` matches anything
- `examined` and `asked` (with `ids` and an optional `min`), `diagnosisIs`, `outcomeIs`
- `vitalNeverBelow`, `vitalNeverAbove`
- `rulePassed`, `ruleFailed`, and `all`, `any`, `not` to combine them

### Testing a case

1. Add an "ideal clinician" policy in `tests/unit/cases/policies.ts`: a timed script of first actions plus any reactive rules. The library test checks that this run stabilises across seeds and that doing nothing ends badly.
2. Run `npm run review:build` to update `docs/clinical-review.md`, and `npm run unity:sync` to copy the case into the Unity pack. Unit tests fail until both are current.
3. Run the full check list above.

## Reporting bugs

Use the **Bug report** template. Include the case and the seed (they're in the URL, for example `#/case/anaphylaxis-01?seed=42`): the same seed and actions reproduce the same run. **Export JSON** in the debrief attaches the whole run.

## Clinical review

If you're a clinician, the most useful thing you can do is check entries in `docs/clinical-review.md` against their sources. Use the **Clinical review** issue template to confirm a value (with the guideline) or suggest a correction.
