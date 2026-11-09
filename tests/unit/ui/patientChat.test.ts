import { APIConnectionError, AuthenticationError } from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_KEY,
  aiReady,
  DEFAULT_AI,
  DEFAULT_MODEL,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../../../src/app/aiSettings.ts';
import {
  askClaude,
  buildRequest,
  FALLBACK_BETA,
  parseReply,
  type PatientClient,
} from '../../../src/app/claudePatient.ts';
import { chatHistory, resolveQuestion, type Ask } from '../../../src/app/patientChat.ts';
import { buildPatientPrompt, HISTORY_TURNS, NONE_ID } from '../../../src/app/patientPrompt.ts';
import { Session } from '../../../src/app/session.ts';
import { CASES } from '../../../src/content/library.ts';
import { caseById } from '../helpers.ts';

const ANA = caseById('anaphylaxis-01');
const KEYED: AiSettings = { enabled: true, apiKey: 'sk-ant-test', model: DEFAULT_MODEL };

function message(text: string, stop: string = 'end_turn'): BetaMessage {
  return { content: [{ type: 'text', text }], stop_reason: stop } as unknown as BetaMessage;
}

function client(reply: () => Promise<BetaMessage>): PatientClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    beta: {
      messages: {
        create: (p) => {
          calls.push(p);
          return reply();
        },
      },
    },
  };
}

function session() {
  const s = new Session(ANA, 1, undefined, { nurse: false, variation: false });
  s.start();
  return s;
}

describe('patient prompt', () => {
  it('is built from the persona and the current band’s answers only', () => {
    const p = buildPatientPrompt(ANA, 1, [], 'Any allergies?');
    expect(p.system).toContain(ANA.patient.name);
    expect(p.system).toContain(ANA.patient.persona);
    for (const d of ANA.dialogue) expect(p.system).toContain(`"${d.a[1]}"`);
    expect(p.system).not.toContain(`"${ANA.dialogue[0]?.a[0]}"`);
    expect(p.user).toContain('<question>Any allergies?</question>');
    expect(p.ids).toEqual([...ANA.dialogue.map((d) => d.id), NONE_ID]);
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    '%s: never includes the diagnosis, brief, labs, results or teaching',
    (_id, c) => {
      const { system, user } = buildPatientPrompt(c, 1, [], 'What is wrong with me?');
      const text = `${system}\n${user}`;
      const secret = [
        ...c.diagnosis.options
          .filter((o) => c.diagnosis.correct.includes(o.id))
          .map((o) => o.label),
        ...c.brief,
        ...c.investigations.flatMap((i) => i.results.map((r) => r.text)),
        ...c.teaching.map((t) => t.text),
        ...c.exam.flatMap((e) => e.findings.map((f) => f.text)),
      ].filter((s) => s.length > 8);
      for (const s of secret) expect(text.toLowerCase()).not.toContain(s.toLowerCase());
      expect(system).toMatch(/don’t know your diagnosis, test results/);
    },
  );

  it('keeps only the most recent exchanges', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
    const { user } = buildPatientPrompt(ANA, 0, history, 'next');
    expect(user).not.toContain('Clinician: q3');
    expect(user).toContain(`Clinician: q${10 - HISTORY_TURNS}`);
    expect(user).toContain('You: a9');
  });

  it('reads question-and-answer pairs from the log', () => {
    const s = session();
    s.act({ kind: 'talk', questionId: 'allergy', text: 'Allergic?' });
    s.act({ kind: 'talk', questionId: null, text: 'Weather?' });
    const h = chatHistory(s.events);
    expect(h.map((x) => x.q)).toEqual(['Allergic?', 'Weather?']);
  });
});

describe('Claude request and reply', () => {
  const prompt = buildPatientPrompt(ANA, 1, [], 'Any allergies?');

  it('uses the configured model, low effort, refusal fallbacks and a strict schema', () => {
    const r = buildRequest({ ...KEYED, model: ' ' }, prompt);
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.betas).toEqual([FALLBACK_BETA]);
    expect(r.fallbacks).toBe('default');
    expect(r.output_config?.effort).toBe('low');
    const schema = r.output_config?.format?.schema as { properties: { questionId: { enum: [] } } };
    expect(schema.properties.questionId.enum).toEqual(prompt.ids);
    expect(buildRequest({ ...KEYED, model: 'claude-haiku-5-5' }, prompt).model).toBe(
      'claude-haiku-5-5',
    );
  });

  it('parses a structured reply and maps "none" to null', () => {
    const ids = prompt.ids;
    expect(parseReply(message('{"reply":"Peanuts.","questionId":"allergy"}'), ids)).toEqual({
      questionId: 'allergy',
      reply: 'Peanuts.',
    });
    expect(parseReply(message('{"reply":"No idea.","questionId":"none"}'), ids)?.questionId).toBe(
      null,
    );
    expect(parseReply(message('{"reply":"x","questionId":"diagnosis"}'), ids)).toBeNull();
    expect(parseReply(message('not json'), ids)).toBeNull();
    expect(parseReply(message('{"reply":"  ","questionId":"allergy"}'), ids)).toBeNull();
  });

  it('returns the reply on success', async () => {
    const c = client(async () => message('{"reply":"Only peanuts.","questionId":"allergy"}'));
    const res = await askClaude(KEYED, prompt, async () => c);
    expect(res).toEqual({ ok: true, questionId: 'allergy', reply: 'Only peanuts.' });
    expect(c.calls).toHaveLength(1);
  });

  it.each([
    ['a refusal', async () => message('', 'refusal'), /declined/],
    ['unreadable output', async () => message('{"oops":1}'), /couldn’t be read/],
    [
      'a rejected key',
      async () => {
        throw new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
      },
      /key was rejected/,
    ],
    [
      'a network failure',
      async () => {
        throw new APIConnectionError({ message: 'offline' });
      },
      /Couldn’t reach/,
    ],
  ])('falls back with a notice on %s', async (_label, reply, notice) => {
    const res = await askClaude(KEYED, prompt, async () => client(reply));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.notice).toMatch(notice);
      expect(res.notice).toMatch(/offline patient answered/);
    }
  });
});

describe('free-text resolution', () => {
  it('works with no key and never calls the API', async () => {
    const ask = vi.fn<Ask>();
    const r = await resolveQuestion(session(), 'Do you have any allergies?', DEFAULT_AI, ask);
    expect(ask).not.toHaveBeenCalled();
    expect(r.via).toBe('offline');
    expect(r.action).toEqual({
      kind: 'talk',
      questionId: 'allergy',
      text: 'Do you have any allergies?',
    });
  });

  it('uses Claude’s reply and id when a key is set', async () => {
    const ask = vi.fn<Ask>(async () => ({ ok: true, questionId: 'ate', reply: 'Satay.' }));
    const r = await resolveQuestion(session(), 'Eaten anything odd?', KEYED, ask);
    expect(r.via).toBe('claude');
    expect(r.action).toEqual({
      kind: 'talk',
      questionId: 'ate',
      text: 'Eaten anything odd?',
      reply: 'Satay.',
    });
  });

  it('falls back to the offline matcher with the notice', async () => {
    const ask = vi.fn<Ask>(async () => ({ ok: false, notice: 'Nope.' }));
    const r = await resolveQuestion(session(), 'Any allergies?', KEYED, ask);
    expect(r).toMatchObject({ via: 'offline', notice: 'Nope.' });
    expect(r.action).toMatchObject({ questionId: 'allergy' });
  });
});

describe('AI settings storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
    });
    return data;
  }

  it('defaults to off with no key when storage is empty or unavailable', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI);
    expect(aiReady(DEFAULT_AI)).toBe(false);
    stubStorage();
    expect(loadAiSettings()).toEqual(DEFAULT_AI);
  });

  it('round-trips and forgets the key', () => {
    const data = stubStorage();
    saveAiSettings(KEYED);
    expect(loadAiSettings()).toEqual(KEYED);
    expect(aiReady(loadAiSettings())).toBe(true);
    saveAiSettings(DEFAULT_AI);
    expect(data.has(AI_KEY)).toBe(false);
  });
});
