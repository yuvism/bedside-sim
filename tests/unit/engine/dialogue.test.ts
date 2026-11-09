import { describe, expect, it } from 'vitest';
import { CASES } from '../../../src/content/library.ts';
import { matchQuestion, normalise, stem, unknownAnswer } from '../../../src/engine/dialogue.ts';
import { SimpleEngine } from '../../../src/engine/engine.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { scoreRun } from '../../../src/engine/scoring.ts';
import type { Action } from '../../../src/engine/types.ts';
import { caseById, LIBRARY, min } from '../helpers.ts';

const ANA = caseById('anaphylaxis-01');
const match = (id: string, q: string) => matchQuestion(caseById(id).dialogue, q).id;

describe('offline question matcher', () => {
  it('normalises punctuation, quotes and case', () => {
    expect(normalise('What’s  HAPPENING, to-you?!')).toBe('what s happening to you');
  });

  it('stems plurals and verb forms together', () => {
    expect(stem('allergies')).toBe(stem('allergy'));
    expect(stem('breathing')).toBe(stem('breathe'));
    expect(stem('worried')).toBe(stem('worry'));
    expect(stem('medicines')).toBe(stem('medicine'));
  });

  it('matches every scripted question to itself in every case', () => {
    for (const c of CASES) {
      for (const d of c.dialogue) {
        expect(matchQuestion(c.dialogue, d.q).id, `${c.id}: ${d.q}`).toBe(d.id);
      }
    }
  });

  it.each([
    ['anaphylaxis-01', 'Do you have any allergies?', 'allergy'],
    ['anaphylaxis-01', 'Are you allergic to anything?', 'allergy'],
    ['anaphylaxis-01', 'Can you breathe OK?', 'breath'],
    ['anaphylaxis-01', 'What did you have for lunch?', 'ate'],
    ['anaphylaxis-01', 'Do you carry an EpiPen?', 'pen'],
    ['anaphylaxis-01', 'Does anyone in your family have allergies?', 'family'],
    ['anaphylaxis-01', 'Are you on any medication?', 'meds'],
    ['anaphylaxis-01', 'What are you scared of?', 'worry'],
    ['asthma-01', 'How many puffs of your Ventolin have you had?', 'inhaler'],
    ['asthma-01', 'Have you ever needed ICU for your asthma?', 'icu'],
    ['stemi-01', 'Does heart disease run in your family?', 'family'],
    ['stemi-01', 'When did the pain start?', 'onset'],
    ['dka-01', 'Have you missed any insulin doses?', 'insulin'],
    ['opioid-01', 'Did you inject heroin?', 'used'],
    ['hyperk-01', 'Did you miss dialysis this week?', 'dialysis'],
    ['haemorrhage-01', 'Are you on blood thinners?', 'meds'],
  ])('%s: "%s" -> %s', (caseId, q, id) => {
    expect(match(caseId, q)).toBe(id);
  });

  it.each([
    'What is the capital of France?',
    'What is your diagnosis?',
    'What is your potassium?',
    'hello',
    '',
  ])('leaves "%s" unmatched', (q) => {
    expect(match('anaphylaxis-01', q)).toBeNull();
  });
});

describe('unknown answers', () => {
  it('says "I don’t know" in a band-appropriate way', () => {
    expect(unknownAnswer(ANA.dialogue, 0)).toMatch(/don't know/);
    expect(unknownAnswer(ANA.dialogue, 1)).toMatch(/^I… don't know/);
  });

  it('is non-verbal when the patient is mostly non-verbal in that band', () => {
    const opioid = caseById('opioid-01');
    expect(unknownAnswer(opioid.dialogue, 2)).toMatch(/^\(.*\)$/);
  });
});

describe('free-text talk action', () => {
  function engine() {
    const e = new SimpleEngine(LIBRARY);
    e.load(ANA, 3);
    return e;
  }

  it('logs the clinician’s words with the matched id and the scripted answer', () => {
    const evs = engine().apply({ kind: 'talk', questionId: 'allergy', text: 'allergic to stuff?' });
    expect(evs.map((e) => e.code)).toEqual(['talk:allergy', 'answer:allergy']);
    expect(evs[0]?.text).toBe('You: allergic to stuff?');
    expect(evs[1]?.text).toBe(ANA.dialogue.find((d) => d.id === 'allergy')?.a[1]);
  });

  it('answers an unmatched question with "I don’t know" under talk:free', () => {
    const evs = engine().apply({ kind: 'talk', questionId: null, text: 'Who won the cup?' });
    expect(evs.map((e) => e.code)).toEqual(['talk:free', 'answer:free']);
    expect(evs[1]?.text).toMatch(/know/);
  });

  it('uses a supplied reply but keeps the dialogue id for scoring', () => {
    const evs = engine().apply({
      kind: 'talk',
      questionId: 'allergy',
      text: 'Any allergies?',
      reply: 'Not that I know of.',
    });
    expect(evs.map((e) => e.code)).toEqual(['talk:allergy', 'answer:allergy']);
    expect(evs[1]?.text).toBe('Not that I know of.');
  });

  it('rejects an empty free-text question and unknown ids', () => {
    expect(engine().apply({ kind: 'talk', questionId: null, text: '  ' })[0]?.type).toBe('warn');
    expect(engine().apply({ kind: 'talk', questionId: 'nope' })[0]?.code).toBe('unknown:talk:nope');
  });

  it('scores a matched free-text question like the button', () => {
    const talk: Action = { kind: 'talk', questionId: 'allergy', text: 'Do you react to anything?' };
    const run = runScript(LIBRARY, ANA, 1, [{ t: 10, action: talk }], { maxSec: min(1) });
    const s = scoreRun(ANA, { ...run, outcome: run.outcome ?? 'ended', diagnosis: null });
    expect(s.results.find((r) => r.id === 'allergy')?.passed).toBe(true);
  });

  it('replays a free-text conversation identically', () => {
    const script = [
      { t: 5, action: { kind: 'talk', questionId: null, text: 'Hi there' } as Action },
      {
        t: 9,
        action: { kind: 'talk', questionId: 'ate', text: 'Lunch?', reply: 'Noodles.' } as Action,
      },
    ];
    const a = runScript(LIBRARY, ANA, 7, script, { maxSec: 30 });
    const b = runScript(LIBRARY, ANA, 7, script, { maxSec: 30 });
    expect(a.events).toEqual(b.events);
    expect(a.events.some((e) => e.text === 'Noodles.')).toBe(true);
  });
});
