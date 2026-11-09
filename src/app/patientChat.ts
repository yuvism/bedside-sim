/**
 * Turns a free-text question into a talk action. Offline, the keyword matcher
 * picks the dialogue entry. With a key, Claude answers in character and names
 * the entry it covered. Either way the action carries a dialogue id (or null),
 * so scoring sees the same codes as a button press.
 */
import { matchQuestion } from '../engine/dialogue.ts';
import { bandFor } from '../engine/narrative.ts';
import type { Action, SimEvent } from '../engine/types.ts';
import { aiReady, type AiSettings } from './aiSettings.ts';
import { askClaude, type AskResult } from './claudePatient.ts';
import { buildPatientPrompt, type ChatTurn, type PatientPrompt } from './patientPrompt.ts';
import type { Session } from './session.ts';

export const MAX_QUESTION_CHARS = 300;

export interface Resolved {
  action: Action;
  /** Shown under the box when Claude couldn't answer. */
  notice: string | null;
  via: 'offline' | 'claude';
}

export function talkBand(s: Session): number {
  const { bands } = s.caseDef;
  return bandFor(bands, s.engine.severities()[bands.process] ?? 0);
}

/** Question-and-answer pairs from the log, oldest first. */
export function chatHistory(events: readonly SimEvent[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  let q: string | null = null;
  for (const e of events) {
    if (e.type === 'action' && e.code.startsWith('talk:')) q = e.text.replace(/^You: /, '');
    else if (e.type === 'patient' && e.code.startsWith('answer:') && q !== null) {
      out.push({ q, a: e.text });
      q = null;
    }
  }
  return out;
}

export function offlineTalk(s: Session, text: string): Action {
  return { kind: 'talk', questionId: matchQuestion(s.caseDef.dialogue, text).id, text };
}

export type Ask = (settings: AiSettings, prompt: PatientPrompt) => Promise<AskResult>;

export async function resolveQuestion(
  s: Session,
  raw: string,
  settings: AiSettings,
  ask: Ask = askClaude,
): Promise<Resolved> {
  const text = raw.trim().slice(0, MAX_QUESTION_CHARS);
  // In arrest there is nobody to answer; the engine logs "No response.".
  if (!aiReady(settings) || s.engine.status().arrest) {
    return { action: offlineTalk(s, text), notice: null, via: 'offline' };
  }
  const prompt = buildPatientPrompt(s.caseDef, talkBand(s), chatHistory(s.events), text);
  const res = await ask(settings, prompt);
  if (!res.ok) return { action: offlineTalk(s, text), notice: res.notice, via: 'offline' };
  return {
    action: { kind: 'talk', questionId: res.questionId, text, reply: res.reply },
    notice: null,
    via: 'claude',
  };
}
