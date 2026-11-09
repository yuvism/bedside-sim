/**
 * Offline free-text matcher: maps a typed question to one of the case's
 * dialogue entries by keyword and word overlap, so scoring works with no
 * API key. Pure and deterministic.
 */
import type { DialogueEntry } from './caseTypes.ts';
import { isNonVerbal } from './narrative.ts';

export interface DialogueMatch {
  /** Matched dialogue id, or null when nothing scores high enough. */
  id: string | null;
  score: number;
}

/** A keyword hit is worth this much; a shared word with the scripted question 1. */
const KEYWORD_WEIGHT = 2;
const PHRASE_WEIGHT = 3;
export const MATCH_THRESHOLD = 2;

const STOPWORDS = new Set(
  (
    'a an the and or but if so of to in on at by for from with about into over ' +
    'i me my mine you your yours we us our he she it its they them their this that these those ' +
    'is am are was were be been being do does did done have has had having can could would ' +
    'should will shall may might must any anything some something there here what which who whom ' +
    'how why tell please just ok okay right now then very much more most also too yes no not ' +
    'get got go going let lets know think sir madam mate bit lot'
  ).split(/\s+/),
);

/** Lower-case, unify quotes and strip punctuation (keeps letters, digits and spaces). */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/'/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A light suffix stripper so "allergies", "allergy" and "breathing", "breathe" meet. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('ied')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function contentStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalise(text).split(' ')) {
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function scoreEntry(entry: DialogueEntry, words: Set<string>, padded: string): number {
  let score = 0;
  const counted = new Set<string>();
  for (const kw of entry.keywords ?? []) {
    const k = normalise(kw);
    if (k.includes(' ')) {
      if (padded.includes(` ${k} `)) score += PHRASE_WEIGHT;
      continue;
    }
    const s = stem(k);
    if (words.has(s) && !counted.has(s)) {
      score += KEYWORD_WEIGHT;
      counted.add(s);
    }
  }
  for (const s of contentStems(entry.q)) if (words.has(s)) score += 1;
  return score;
}

/** Best-scoring entry; ties go to the earlier entry in the case file. */
export function matchQuestion(dialogue: readonly DialogueEntry[], text: string): DialogueMatch {
  const words = contentStems(text);
  const padded = ` ${normalise(text)} `;
  let best: DialogueMatch = { id: null, score: 0 };
  for (const entry of dialogue) {
    const score = scoreEntry(entry, words, padded);
    if (score > best.score) best = { id: entry.id, score };
  }
  return best.score >= MATCH_THRESHOLD ? best : { id: null, score: best.score };
}

/**
 * What the patient says to a question the case file doesn't cover. Matches
 * how the patient is talking in this band: if most scripted answers are
 * non-verbal, so is this one.
 */
export function unknownAnswer(dialogue: readonly DialogueEntry[], band: number): string {
  const answers = dialogue.map((d) => d.a[Math.min(band, d.a.length - 1)] ?? '');
  const silent = answers.filter(isNonVerbal).length;
  if (answers.length && silent * 2 > answers.length) return '(No meaningful answer.)';
  if (band <= 0) return "Sorry, I don't know.";
  if (band === 1) return "I… don't know.";
  return 'Don’t… know…';
}
