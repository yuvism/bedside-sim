# Video validation mode

> **Educational simulation. Simplified physiology. Not clinical guidance.**

Video validation compares the simulator with what happened to a real patient. You annotate a treatment video into a CSV timeline of vital signs and actions. Bedside sim then replays the same actions, at the same times, through the engine with a fixed seed, and compares the simulated vitals with the ones you observed.

Open it from the case list (**Validation**) or at `#/validate`. Everything runs in your browser and nothing is uploaded.

## The reference CSV

```csv
# source: Where the video came from (no patient identifiers)
# case: anaphylaxis-01
# seed: 1
# offset: 0
t_sec,hr,sbp,dbp,spo2,rr,etco2,event
0,118,84,50,92,26,,"Patient on trolley, wheeze and widespread hives"
20,120,,,92,27,,help
40,121,,,93,27,,device:o2_nrb:on
95,,,,,,,drug:adrenaline:IM
```

| Column  | Meaning                                                              |
| ------- | -------------------------------------------------------------------- |
| `t_sec` | Seconds from your chosen time zero in the video (required).          |
| `hr`    | Heart rate, beats per minute.                                        |
| `sbp`   | Systolic blood pressure, mmHg.                                       |
| `dbp`   | Diastolic blood pressure, mmHg.                                      |
| `spo2`  | Oxygen saturation, %.                                                |
| `rr`    | Respiratory rate, breaths per minute.                                |
| `etco2` | End-tidal CO₂, mmHg.                                                 |
| `event` | What happened at that moment: an action id or free text (see below). |

- Leave a cell **blank** (or write `NA`) when the value isn't visible. Don't guess or carry values forward: blanks are skipped, not counted as errors.
- Rows can be in any order; they are sorted by time. Extra columns are ignored with a warning.
- Put several events in one cell with `;`, for example `help; device:o2_nrb:on`.
- Quote a cell that contains a comma: `"wheeze, hives"`.
- Comment lines start with `#`. `# key: value` comments set the case, seed and offset when the file is loaded, and `# source:` is shown on screen and saved in the report.

### Event ids

Events use the same codes the engine writes to its own log, so a run exported from the simulator can be read back as a reference. An optional amount goes on the end; without it, the formulary's standard amount is used.

| Event                                | Example                    | Replays as                              |
| ------------------------------------ | -------------------------- | --------------------------------------- |
| `drug:<drug>:<route>[:<dose>]`       | `drug:adrenaline:IM:0.5`   | A drug dose (route as in the formulary) |
| `infusion:<drug>[:<rate>]`           | `infusion:adrenaline:0.05` | Start or change an infusion             |
| `infusion:<drug>:stop`               | `infusion:adrenaline:stop` | Stop it                                 |
| `fluid:<fluid>[:<ml>]`               | `fluid:crystalloid:500`    | A fluid bolus                           |
| `device:<device>[:on\|off]`          | `device:o2_nrb:on`         | Oxygen, BVM, pads, leg raise and so on  |
| `procedure:<procedure>`              | `procedure:iv_access`      | Cannula, chest drain, pelvic binder…    |
| `order:<test>`                       | `order:abg`                | Send a test                             |
| `talk:<question>`, `exam:<exam>`     | `talk:allergy`, `exam:B`   | Ask or examine (ids from the case)      |
| `dx:<diagnosis>`                     | `dx:anaphylaxis`           | Record a working diagnosis              |
| `help`, `pulse_check`, `cpr:on\|off` | `cpr:on`                   | Call for help, check rhythm/pulse, CPR  |
| `shock[:<joules>]`                   | `shock:150`                | Defibrillate (150 J if not given)       |

Drug, device, procedure and test ids are listed in `src/content/formulary.json`, `devices.json` and `investigations.json`. Anything that isn't a valid id (including a typo) is kept as an **annotation**: it shows in the events table with the reason, and isn't replayed.

## How to annotate a video

1. **Get permission first.** Only use videos you are allowed to use for this purpose, follow your institution's rules on consent and data protection, and keep the CSV free of anything that identifies the patient or staff. Describe the source in `# source:` without identifiers.
2. **Pick the case** whose starting state is closest to the patient in the video. Validation only tells you something if the case is meant to represent that kind of patient.
3. **Choose time zero.** Usually the moment the patient is first assessed and the monitor is visible. If the case's start corresponds to a later moment in the video, use the **offset**: sim time = video time + offset.
4. **Record vitals as they appear on the monitor**, every 20 to 30 seconds and whenever something changes. Record blood pressure only when a new cuff reading appears, at the time it appears. Leave unreadable values blank.
5. **Record actions when they happen to the patient**, not when they are ordered: the moment the drug goes in, the mask goes on, the bolus starts.
6. **Use free text** for anything else that helps interpret the run ("patient vomits", "second doctor arrives").
7. **Ideally, annotate twice.** Two people annotating independently, then reconciling differences, makes the reference more trustworthy.

## Running a comparison

1. Load your CSV (or the sample), check the case, seed and offset, and look at the events table: every action you meant to replay should show its code under **Replayed as**.
2. Set a **tolerance** for each vital: the largest difference you'd accept as agreement.
3. Read the charts: simulated in blue, reference in orange (dots are your observations), shaded where the difference is beyond tolerance, and dashed lines at each replayed action.
4. Add **key transitions** to measure response timing, for example from `drug:adrenaline` to systolic BP above 90.
5. **Download the report** (JSON with all inputs and results) and the **charts** (PNG).

The engine's actions are applied instantly at the given times, with no nurse delays, because the reference records when things actually happened.

## Metrics

For each vital, the simulated value is taken at the same second as each reference observation (after the offset). With the differences _dᵢ = simᵢ − refᵢ_ over the _n_ observed points:

| Metric           | Definition                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RMSE             | √(Σ dᵢ² / n): typical size of the error, weighting big misses more.                                                                                                                                           |
| MAE              | Σ \|dᵢ\| / n: average size of the error.                                                                                                                                                                      |
| Bias             | Σ dᵢ / n: positive when the sim reads high on average.                                                                                                                                                        |
| Max deviation    | The largest \|dᵢ\|, and when it happened.                                                                                                                                                                     |
| Within tolerance | Share of points with \|dᵢ\| ≤ tolerance.                                                                                                                                                                      |
| Divergence       | A run of consecutive points beyond tolerance, with its peak and direction.                                                                                                                                    |
| Transition lag   | Time from the first matching action to the vital crossing the threshold, in the video and in the sim (crossings are interpolated between readings). Lag = sim − video: positive means the sim responds later. |

## Limitations

- The engine is a simplified teaching model. Agreement with one video doesn't make it clinically accurate, and disagreement may come from the case's starting state rather than the physiology.
- A seed is one possible run. For a fairer picture, repeat with several seeds and compare the spread.
- Reference values are only as good as the annotation: monitors lag, cuffs cycle slowly, and some values are hard to read on video.
- Matching is to the nearest second; sub-second timing isn't meaningful here.

## Sample file

[`src/content/validation/anaphylaxis-01-sample.csv`](../src/content/validation/anaphylaxis-01-sample.csv) is a **synthetic example written for this documentation, not an annotation of a real patient or video**. It's meant for the `anaphylaxis-01` case with seed 1, and it deliberately differs from the simulation in places (lower SpO₂ before oxygen, a faster blood-pressure response to the first adrenaline dose), so you can see divergence flags and a transition lag. Load it with **Load sample**.

## Learn from a video

**Learn from a video** (`#/learn`, or **Learn from a video** on the case list) goes one step further than validation. It **updates the case itself** so its vitals follow the video, and it **proposes what's missing**. Nothing is applied directly: every change lands in an editor draft for a person to review.

### The simplest way to update the simulation from a real hospital video

1. **Permission and privacy first.** Use a video only if you have consent and approval to use it for teaching or research. Remove identifiers before annotating. The video never leaves your device; the CSV must contain no names, faces, dates of birth or hospital numbers.
2. **Open Learn from a video** and choose **Open a video file**. Press **Scenario starts now** at the moment the case should start, for example when the patient arrives on the monitor.
3. **Annotate as you watch.** Every 10–30 seconds, pause and **Add a reading**: type the monitor values, or press **Read monitor with Claude** to fill them in from the current frame. That option needs your own key in Settings and sends that one frame to Anthropic, so use it only where your approvals allow. Check every value it fills in. Add each action when it happens, using the suggested codes, for example `drug:adrenaline:IM`. Anything else becomes a note.
4. **Pick the closest case** and press **Analyse the video**. In a few seconds you get:
   - **Update: fitted values.** These are the case's numbers (how severe it starts, how fast it worsens, how strongly treatments work, baseline vitals) that make the simulation track the video. A table shows the error before and after for each vital.
   - **Add what's missing.** This covers scoring for actions the team took that the case doesn't credit yet, prompts and patient lines from your notes, and test results the case can't answer yet.
   - **Needs a library change.** These are drugs, routes, devices or procedures the shared library doesn't have yet. They need a sourced edit to `src/content/` (see CONTRIBUTING.md), and then you analyse again.
5. **Tick what makes clinical sense**, then choose **Create a draft for review**. The draft is a new case `<case-id>-video`. Every fitted value gets a dated source note and `reviewNeeded`, so it appears in the clinical review list.
6. **Test-run the draft** at the bedside. Then **Export JSON** from the editor, and open a pull request with the case, the timeline CSV (**Download timeline CSV**) and the update pack (**Download update pack**). A clinician reviews the pull request before it is merged.

### How it works

- **Fitting** (`src/engine/learning/fit.ts`):
  - It adjusts only bounded, case-level **tunables** (`tunables.ts`), each within a set range, for example 0.25–4× for rates and 0.7–1.3× for baselines.
  - It replays the video's own actions at their times with the chosen seed, and minimises the squared difference from the video's vitals in tolerance units. Missing simulated values count as a fixed penalty.
  - The search is a deterministic pattern search, so the same video, case and seed always give the same proposal.
- **Proposals** (`propose.ts`):
  - Notes become guided-mode prompts tied to the case's severity at that moment.
  - Notes that start with "Patient", "Says" or a quotation mark become patient lines.
  - Talking and examining aren't scored automatically.
- **Limits:** one video is one patient. Fitting to a single video can over-fit, so treat the result as a suggestion, compare several seeds, and prefer several videos of the same condition.

### Worked example: the AMAX4 simulation video

[`src/content/validation/amax4-simulation-annotation.csv`](../src/content/validation/amax4-simulation-annotation.csv) is an annotation of the publicly available **"AMAX4 Simulation MASTER"** video (Live to the MAX!, YouTube, https://www.youtube.com/watch?v=o3NDS3snnxc). That video is a **manikin simulation, not a real patient**.

- Vitals come from the on-screen monitor overlay, and events come from the captions and visible actions, described in our own words. No transcript or captions are reproduced.
- Analysing it against the existing asthma case flagged several library gaps: no front-of-neck access, no intubation and no IV salbutamol. It also flagged missing scoring for bag-mask ventilation and IV magnesium.
- Those findings led to:
  - the new library entries;
  - the new case **asthma-02 "Can't ventilate"**;
  - a fit that cut the heart-rate error from 41.9 to 11.0 beats per minute.

Load it with **Load the AMAX4 example**.
