/**
 * Guided-mode coaching: the nurse speaks up after a spell with no action
 * (case hints, in order, when their condition holds) and flags alarming
 * vitals. Exam mode stays silent.
 */
import type { CaseDef } from './caseTypes.ts';
import type { BedsideEngine } from './engine.ts';
import type { SimEvent } from './types.ts';

export type Mode = 'guided' | 'exam';

/** Seconds without a clinician action before the nurse offers a hint. */
export const IDLE_HINT_SEC = 60;
/** Minimum gap between prompts about the same vital sign. */
export const VITAL_PROMPT_GAP_SEC = 180;

interface VitalPrompt {
  key: string;
  test: (v: ReturnType<BedsideEngine['vitals']>) => boolean;
  text: (v: ReturnType<BedsideEngine['vitals']>) => string;
}

const VITAL_PROMPTS: VitalPrompt[] = [
  {
    key: 'spo2',
    test: (v) => v.spo2 !== null && v.spo2 < 90,
    text: (v) => `Doctor, sats are ${Math.round(v.spo2 ?? 0)}%.`,
  },
  {
    key: 'sbp',
    test: (v) => v.sbp !== null && v.sbp < 85,
    text: (v) => `Blood pressure's dropped to ${Math.round(v.sbp ?? 0)} systolic.`,
  },
  {
    key: 'hr',
    test: (v) => v.hr !== null && (v.hr > 140 || v.hr < 45),
    text: (v) => `Heart rate is ${Math.round(v.hr ?? 0)}.`,
  },
  {
    key: 'gcs',
    test: (v) => v.gcs < 9,
    text: (v) => `GCS is down to ${v.gcs}. I'm worried about the airway.`,
  },
];

export class Coach {
  readonly mode: Mode;
  private readonly c: CaseDef;
  private lastActionT = 0;
  private readonly given = new Set<string>();
  private readonly lastVital: Record<string, number> = {};

  constructor(caseDef: CaseDef, mode: Mode) {
    this.c = caseDef;
    this.mode = mode;
  }

  noteAction(t: number): void {
    this.lastActionT = t;
  }

  tick(engine: BedsideEngine): SimEvent[] {
    if (this.mode === 'exam') return [];
    const t = engine.time;
    const st = engine.status();
    if (st.outcome) return [];
    const out: SimEvent[] = [];
    if (!st.arrest) {
      const v = engine.vitals();
      for (const p of VITAL_PROMPTS) {
        if (!p.test(v)) continue;
        if (t - (this.lastVital[p.key] ?? -Infinity) < VITAL_PROMPT_GAP_SEC) continue;
        this.lastVital[p.key] = t;
        out.push({ t, type: 'nurse', code: `nurse:vital:${p.key}`, text: p.text(v) });
      }
    }
    if (t - this.lastActionT >= IDLE_HINT_SEC) {
      const hint = (this.c.hints ?? []).find(
        (h) => !this.given.has(h.id) && (!h.when || engine.check(h.when)),
      );
      if (hint) {
        this.given.add(hint.id);
        out.push({ t, type: 'nurse', code: `nurse:hint:${hint.id}`, text: hint.text });
      }
      this.lastActionT = t;
    }
    return out;
  }
}

/** Event codes kept out of the log in exam mode (teaching notes give answers away). */
export function hiddenInExam(code: string): boolean {
  return code.startsWith('note:drug:') || code.startsWith('note:order:');
}
