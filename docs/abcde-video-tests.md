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

All three famous videos were read by **Gemini 3.5 Flash-Lite**: on this day the free Flash models were busy or had used their free requests. AMAX4 was read by Gemini 3.6 Flash.

| Video                      | Time | Scenario start (AI)          | Readings                               | Actions | What we found                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---- | ---------------------------- | -------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Geeky Medics, Sepsis    | 28 s | 3:30                         | 62 rows from the on-screen monitor     | 16      | Every action falls in the right ABCDE chapter: IV access and bloods in Circulation, glucose in Disability, antibiotics and catheter in Exposure. The senior call is 2 s after the SBAR chapter starts. The start time was set late (when the monitor first appears), so the airway part was skipped. |
| 2. Resus Council UK        | 17 s | 0:19                         | 3 rows, mostly observations said aloud | 10      | Sats probe (1:46 against 1:48), BP cuff (3:25 against 3:24) and IV cannula (4:22 against about 4:19) are within 1–3 s. Oxygen was logged 30–50 s early. It missed SpO₂ 95–96 % on the monitor close-up at 3:05. It found the "sepsis six" steps in order.                                            |
| 3. Geeky Medics, Asthma    | 22 s | 0:09                         | 2 rows, observations said aloud        | 20      | The A, C, D, E and SBAR steps are within 1–8 s of the chapter markers (B was 10 s early). Oxygen, nebulised salbutamol and ipratropium, ABG, chest X-ray, cannula, bloods, ECG, prednisolone and a senior review were all found.                                                                     |
| Our own simulator clip     | 12 s | 0:00                         | 3 rows                                 | 3       | First reading exact (HR 130, SpO₂ 77, BP 152/83). Later: HR 4–7 too low and one SpO₂ misread (72 where the monitor showed 83). Help and oxygen within 1 s. The salbutamol time was read off the simulator's on-screen clock instead of the video.                                                    |
| AMAX4 (16 Nov, hand-typed) | 43 s | 14:14 (after the interviews) | 48 rows                                | many    | HR ±2.1 /min, systolic BP ±1.7 mmHg, SpO₂ ±0.3 % against 28 hand readings. Drugs within 1 s.                                                                                                                                                                                                         |

**Analyse** ran on all three timelines. Each time it changed 8–9 case values and suggested 16–25 additions. With only 2–3 readings in videos 2 and 3, the fit is easy, so its "error after" is not a measure of accuracy there.

## What this shows

1. **Actions are reliable.** In every video the AI found what the team did, in the right order and usually within seconds.
2. **Numbers need a monitor.** When a monitor is shown clearly (AMAX4, our own clip), readings are close. OSCE-style videos mostly say the observations aloud, so there are few readings to fit.
3. **The teacher check is essential.** The free backup model (Flash-Lite) misread a few values and took one time from an on-screen clock. That's why every AI row is marked "AI · check" and Analyse stays off until all are checked.

## What we changed because of these tests

- **Hidden retries removed.** The Gemini SDK retried a failed request up to 4 times, resending the whole video each time, and every retry counted towards the free limit. One busy moment could use half a day's requests. Retries are now off, and the console moves on to the next model instead.
- **More models to fall back on.** Each free model family has its own allowance of about 20 requests a day, and busy answers count too. The console now tries `gemini-3.6-flash`, then `gemini-3.8-flash`, `gemini-4-hydrogen` and `gemini-3.5-flash-lite`. Models that share an allowance (`gemini-3.7-flash` shares 3.8's) are left out.
- **Clear messages.** When no model can take the video, the console says which were busy and which were out of free requests, and when the limit resets.
- **A time limit per model** (5 minutes), so a stuck request moves on instead of hanging.
- **Observations said aloud** are now used when no monitor is shown, reported once at the moment they are said.

## Repeat it

1. Run `npm run demo` (or `npm run teacher`) with a free key in `.env`.
2. Open **Learn from a video**, paste one of the links above, choose the case from the table, tick consent and press **Autofill with AI**.
3. Check the rows against the video, then press **Analyse the video**.

On the free tier, keep a few requests for the day of a demo: they reset at midnight Pacific time (1:30 pm in India).
