# Bedside sim

> **Educational simulation. Simplified physiology. Not clinical guidance.**

An open-source virtual patient simulator that runs in the browser. You talk to the patient, examine them, order tests and treat them, and their physiology responds in real time to what you do and to what you don't.

**Live demo:** https://yuvism.github.io/bedside-sim/

## Status

Early build. See [PROGRESS.md](PROGRESS.md) for what's done and what's next.

## Planned features

- A live bedside monitor (ECG, SpO₂ pleth, capnography, arterial line) with alarms and audio
- A deterministic, data-driven physiology engine: disease processes, pharmacology, rhythm changes and cardiac arrest
- Talk, examine (ABCDE and head-to-toe), investigate and treat panels
- Rule-based scoring and a debrief with a timeline drawn over the vitals
- Ten cases written as plain JSON, plus a case editor
- A video validation mode that compares a simulated run with a timeline annotated from a real treatment video
- A Unity port pack that mirrors the engine in C#

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

- [Pulse Physiology Engine](https://pulse.kitware.com/) (Kitware, Apache-2.0) and [BioGears](https://www.biogearsengine.com/) are the reference open-source physiology engines. The engine interface is designed so a Pulse-backed engine can be swapped in for the Unity version.
- [Infirmary Integrated](https://www.infirmary-integrated.com/) is the reference for monitor waveforms and the rhythm list.

## Disclaimer

Bedside sim is a teaching tool with a deliberately simplified physiology model. Doses, thresholds and timings are there for teaching, and several are flagged for clinical review (see `docs/clinical-review.md`). Don't use it to make decisions about real patients.

## Licence

[MIT](LICENSE)
