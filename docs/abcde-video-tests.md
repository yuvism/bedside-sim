# Autofill with AI on the most-watched UK ABCDE videos

_Tested 17 November 2026. Educational simulation. Simplified physiology. Not clinical guidance._

We ran **Autofill with AI** and **Analyse** on the three most-watched UK ABCDE simulation videos on YouTube. Each video went through the teacher console exactly as a teacher would use it: the public YouTube link, the closest case, consent ticked. We then checked the AI's answer against the video itself.

The videos are linked, not copied. Nothing from them (frames, transcript or captions) is stored in this repository. The descriptions in the results are in our own words.

## The videos

YouTube views on 17 November 2026, from a search for "ABCDE assessment simulation". Lecture-style and trauma videos are left out.

| #   | Video                                                                                                      | Channel                  | Length | Views  | Case used                             |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ------ | ------ | ------------------------------------- |
| 1   | [ABCDE Assessment: Sepsis, emergency simulation scenario](https://www.youtube.com/watch?v=Ix7kP8-rIpA)     | Geeky Medics             | 14:10  | 1.22 M | `sepsis-01` "Feverish and muddled"    |
| 2   | [RC (UK) ABCDE assessment demo](https://www.youtube.com/watch?v=KNqoXboSVUI)                               | Resuscitation Council UK | 6:46   | 0.77 M | `sepsis-01` "Feverish and muddled"    |
| 3   | [ABCDE Assessment: Asthma exacerbation, emergency simulation](https://www.youtube.com/watch?v=AKRr2PMl4zE) | Geeky Medics             | 12:43  | 0.25 M | `asthma-01` "Can't finish a sentence" |

## How we checked

There is no hand annotation for these videos, so we checked the AI's answer three ways:

- **Chapter markers.** The two Geeky Medics videos list chapter times in their descriptions (Airway, Breathing, Circulation, Disability, Exposure, SBAR). We compared them with the times the AI gave.
- **Frame by frame.** For the Resuscitation Council UK video (downloaded for the live demo), we looked at one frame a second and compared the visible actions and monitor values.
- **Known truth.** A 27-second clip recorded from our own simulator. Every value on its monitor is known.

The AMAX4 test from 16 November is also shown. It is the only test with a full hand annotation (see [validation.md](validation.md)).

## Results

Run on the evening of 17 November with **Gemini 4 Hydrogen**, one of the free models the console uses. The free Flash models were busy that evening. A first run the same day used the fast backup model, **Gemini 3.5 Flash-Lite**; it's compared below. AMAX4 was read by Gemini 3.6 Flash.

| Video                      | Time  | Scenario start (AI)          | Readings                                                | Rows | What we found                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----- | ---------------------------- | ------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Geeky Medics, Sepsis    | 4 min | 0:10                         | 4 values, from on-screen text and speech                | 52   | The A, B, C, D, E and SBAR steps came at 1:02, 1:36, 4:43, 7:53, 8:55 and 10:59. The chapter markers are 1:01, 1:34, 4:43, 7:50, 8:54 and 10:58, so every step is within 0–3 s. Oxygen, ABG, chest X-ray, cultures, cannula, bloods, ECG, fluids, glucose, antibiotics, catheter and the senior call were all found. |
| 2. Resus Council UK        | 2 min | 0:18                         | The observations said aloud, and both monitor close-ups | 39   | Both monitor close-ups read exactly: SpO₂ 96 at 3:08, then HR 120, BP 99/59 and SpO₂ 97 at 5:02. Sats probe at 1:48 (exact), oxygen mask 2:20 (on screen 2:21), BP cuff 3:20 (3:24), ECG leads 4:18 and cannula 4:21.                                                                                                |
| 3. Geeky Medics, Asthma    | 2 min | 0:10                         | 3 sets, said aloud (SpO₂ 91 → 95 after the nebuliser)   | 42   | The A, D, E and SBAR steps are within 1–2 s of the chapter markers; B and C came 9–12 s before theirs. The doses were caught as said: salbutamol 5 mg, prednisolone 40 mg.                                                                                                                                           |
| Our own simulator clip     | 12 s  | 0:00                         | 3 rows (Flash-Lite)                                     | 6    | First reading exact (HR 130, SpO₂ 77, BP 152/83). Later: HR 4–7 too low and one SpO₂ misread (72 where the monitor showed 83). Help and oxygen within 1 s. The salbutamol time was read off the simulator's on-screen clock instead of the video.                                                                    |
| AMAX4 (16 Nov, hand-typed) | 43 s  | 14:14 (after the interviews) | 48 rows (Gemini 3.6 Flash)                              | 48   | HR ±2.1 /min, systolic BP ±1.7 mmHg, SpO₂ ±0.3 % against 28 hand readings. Drugs within 1 s.                                                                                                                                                                                                                         |

**Analyse** ran on all three timelines. Each time it changed 8–9 case values and suggested 39–57 additions. With only a few readings per video, the fit is easy, so its "error after" is not a measure of accuracy here.

### The fast backup model compared

|                                     | Gemini 3.5 Flash-Lite (backup)                       | Gemini 4 Hydrogen              |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------ |
| Time per video                      | 17–28 s                                              | 2–4 min                        |
| Rows found                          | 15–73                                                | 39–52, with doses              |
| Sepsis: scenario start              | 3:30, so the airway and breathing parts were skipped | 0:10 (correct)                 |
| Sepsis: readings                    | One value repeated every 10 s for 9 minutes          | Each value once, as instructed |
| Resus Council UK: monitor close-ups | Missed SpO₂ 96 at 3:08                               | Both read exactly              |
| Resus Council UK: oxygen            | 30–50 s early                                        | Within 1 s                     |

The AI timelines from both runs are in the Drive folder.

## What this shows

1. **Actions are reliable.** With the full model, the A–E steps landed within 0–3 s of the videos' own chapter markers, and every action we could see in the frames was within 0–4 s.
2. **Numbers need a monitor.** Monitor close-ups were read exactly (Resus Council UK, AMAX4). OSCE-style videos mostly say the observations aloud, so there are only a few readings to fit.
3. **The model matters, and so does the teacher check.** The fast backup model makes mistakes the full model doesn't. The console tries the stronger free models first, and every AI row is marked "AI · check" until the teacher has looked at it.

## What we changed because of these tests

- **Hidden retries removed.** The Gemini SDK retried a failed request up to 4 times, resending the whole video each time, and every retry counted towards the free limit. One busy moment could use half a day's requests. Retries are now off, and the console moves on to the next model instead.
- **More models to fall back on.** Each free model family has its own allowance of about 20 requests a day, and busy answers count too. The console now tries `gemini-3.6-flash`, then `gemini-3.8-flash`, `gemini-4-hydrogen` and `gemini-3.5-flash-lite`. Models that share an allowance (`gemini-3.7-flash` shares 3.8's) are left out.
- **Clear messages.** When no model can take the video, the console says which were busy and which were out of free requests, and when the limit resets.
- **A time limit per model** (6 minutes; the full model took up to 4 for a 14-minute video), so a stuck request moves on instead of hanging.
- **Observations said aloud** are now used when no monitor is shown, reported once at the moment they are said.

## Repeat it

1. Run `npm run demo` (or `npm run teacher`) with a free key in `.env`.
2. Open **Learn from a video**, paste one of the links above, choose the case from the table, tick consent and press **Autofill with AI**.
3. Check the rows against the video, then press **Analyse the video**.

On the free tier, keep a few requests for the day of a demo: they reset at midnight Pacific time (1:30 pm in India).
