# Bedside sim

> **Educational simulation. Simplified physiology. Not clinical guidance.**

An open-source virtual patient simulator that runs in the browser. You talk to the patient, examine them, order tests and treat them, and their physiology responds in real time to what you do and to what you don't.

**Live demo:** https://yuvism.github.io/bedside-sim/

## Status

Phases 0–8 of 10 are built. See [PROGRESS.md](PROGRESS.md) for what's done and what's next.

## Features

- **A live bedside monitor:**
  - ECG that reflects the rhythm, ST elevation, peaked T waves and CPR artifact
  - SpO₂ pleth, capnography and an arterial line
  - NIBP cycling
  - graded alarms with sound, and a pulse beep whose pitch falls with SpO₂
- **A deterministic, data-driven physiology engine:** disease processes, one-compartment pharmacology with Emax effects, infusions, baroreflex and gas-exchange coupling, a rhythm state machine, and a full ALS loop with CPR, shocks and ROSC
- **Talk, Examine, Investigate and Treat panels:**
  - examination by ABCDE plus a head-to-toe body map
  - tests with realistic turnaround times and a results inbox
  - a searchable formulary with route, dose and infusion pickers
- **Scoring and debrief:** rule-based scoring with critical fails, and a debrief with a checklist, a vitals timeline with action markers and teaching points. Runs can be exported as JSON or CSV, or replayed from any minute.
- **Ten cases written as plain JSON:** anaphylaxis, acute severe asthma, STEMI with VF, septic shock, DKA, hypoglycaemia, opioid overdose, tension pneumothorax, pelvic haemorrhage and hyperkalaemia. Each has an automated ideal-run test and a do-nothing test.

- **A nurse at the bedside:** she reads back your orders, carries them out after realistic delays, and challenges unsafe ones (allergies, contraindications, overdoses, no IV access).
- **Guided mode:** prompts and teaching notes as you go. **Exam mode:** silent, with an OSCE-style breakdown and pass mark at the end.
- **Seeded patient variations:** age, weight, allergies, comorbidities and where the key clue hides, so each run is a little different.
- **Ask the patient anything:** type a question in your own words. With no key, an offline matcher maps it to the case's scripted questions. With your own Anthropic API key (Settings), Claude plays the patient using only what's in the case file, and never reveals the diagnosis or results.
- **Optional 3D bedside view:** a low-poly resus bay that follows the patient's state, with a live monitor screen and clickable objects that open the matching panel. 2D stays the default.
- **Case editor:** build or change a case with forms generated from the case schema, with live validation, a test run at the bedside, and JSON import, export and duplication. Drafts stay in your browser.

Still to come: video validation mode and a Unity port pack.

## Write your own case

Open **Case editor** from the case list, choose **New case** (a playable starter) or duplicate a library case, and edit it section by section. Problems show next to their fields. When it's valid, **Test run** plays it at the bedside. **Export JSON** gives you a file you can add to `src/content/cases/` and contribute back.

### About the optional AI patient

The AI patient is off by default and the app works fully without it. If you turn it on, your API key is saved only in your browser's local storage and sent only to the Anthropic API, directly from the page. Anyone who can use that browser profile could read it, so use a key with a low spend limit and select **Forget key** when you're done. Each question is billed to your Anthropic account.

## Cases

| Case                           | Specialty      | Guideline                      |
| ------------------------------ | -------------- | ------------------------------ |
| Collapse after lunch           | Emergency      | Resuscitation Council UK 2021  |
| Can't finish a sentence        | Respiratory    | BTS/SIGN 158                   |
| Crushing chest pain            | Cardiology     | ESC ACS 2023, RCUK ALS 2021    |
| Feverish and muddled           | Acute medicine | Surviving Sepsis Campaign 2021 |
| Vomiting and breathing fast    | Endocrinology  | JBDS DKA                       |
| Found drowsy at home           | Endocrinology  | JBDS hypoglycaemia             |
| Unresponsive in the toilets    | Toxicology     | BNF naloxone, RCUK ALS         |
| Motorbike crash, can't breathe | Trauma         | ATLS 10th edition              |
| Pelvic crush                   | Trauma         | ATLS 10th edition, CRASH-2     |
| Weak and dizzy on dialysis day | Renal          | UK Kidney Association 2020     |

## Run locally

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Start the dev server                           |
| `npm run build`    | Type-check and build to `dist/`                |
| `npm run lint`     | ESLint                                         |
| `npm run test`     | Unit tests (Vitest)                            |
| `npm run test:e2e` | End-to-end smoke test (Playwright, on `dist/`) |
| `npm run format`   | Prettier                                       |

For the first e2e run, install the Playwright browser once with `npx playwright install chromium`.

## Credits and inspiration

- The optional 3D view uses [three.js](https://threejs.org/) (MIT). Every 3D object is built from primitives in code; see [ASSETS.md](ASSETS.md).

- [Pulse Physiology Engine](https://pulse.kitware.com/) (Kitware, Apache-2.0) and [BioGears](https://www.biogearsengine.com/) are the reference open-source physiology engines. The engine interface is designed so a Pulse-backed engine can be swapped in for the Unity version.
- [Infirmary Integrated](https://www.infirmary-integrated.com/) is the reference for monitor waveforms and the rhythm list.

## Disclaimer

Bedside sim is a teaching tool with a deliberately simplified physiology model. Doses, thresholds and timings are there for teaching, and several are flagged for clinical review (see `docs/clinical-review.md`). Don't use it to make decisions about real patients.

## Licence

[MIT](LICENSE)
