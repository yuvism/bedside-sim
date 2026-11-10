import { AuthenticationError } from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, type AiSettings } from '../../../src/app/aiSettings.ts';
import { FALLBACK_BETA, type PatientClient } from '../../../src/app/claudePatient.ts';
import {
  buildVisionRequest,
  MONITOR_KEYS,
  parseVision,
  readMonitorFrame,
} from '../../../src/app/claudeVision.ts';

const KEYED: AiSettings = { enabled: true, apiKey: ' sk-ant-test ', model: DEFAULT_MODEL };

function message(text: string, stop: string = 'end_turn'): BetaMessage {
  return { content: [{ type: 'text', text }], stop_reason: stop } as unknown as BetaMessage;
}

function client(reply: () => Promise<BetaMessage>) {
  const calls: unknown[] = [];
  const keys: string[] = [];
  const make = (apiKey: string): Promise<PatientClient> => {
    keys.push(apiKey);
    return Promise.resolve({
      beta: {
        messages: {
          create: (p) => {
            calls.push(p);
            return reply();
          },
        },
      },
    });
  };
  return { make, calls, keys };
}

describe('Claude monitor reading', () => {
  it('sends one JPEG frame with a strict JSON schema and refusal fallbacks', () => {
    const req = buildVisionRequest({ ...KEYED, model: '  ' }, 'QUJD');
    expect(req.model).toBe(DEFAULT_MODEL);
    expect(req.betas).toEqual([FALLBACK_BETA]);
    expect(req.fallbacks).toBe('default');
    const format = req.output_config?.format as unknown as { schema: { required: string[] } };
    expect(format.schema.required).toEqual([...MONITOR_KEYS, 'notes']);
    const content = req.messages[0]?.content as { type: string; source?: { data: string } }[];
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' },
    });
    expect(req.system).toMatch(/Never estimate/);
  });

  it('keeps only plausible numbers and turns anything else into null', () => {
    const r = parseVision(
      message(
        JSON.stringify({
          hr: 58,
          sbp: 88,
          dbp: null,
          spo2: 140,
          rr: '22',
          etco2: 41.5,
          notes: 'SpO2 shows dashes.',
        }),
      ),
    );
    expect(r).toEqual({
      hr: 58,
      sbp: 88,
      dbp: null,
      spo2: null,
      rr: null,
      etco2: 41.5,
      notes: 'SpO2 shows dashes.',
    });
    expect(parseVision(message('not json'))).toBeNull();
  });

  it('reads a frame with a trimmed key and reports refusals and API errors', async () => {
    const good = client(() =>
      Promise.resolve(
        message('{"hr":120,"sbp":90,"dbp":50,"spo2":88,"rr":null,"etco2":null,"notes":""}'),
      ),
    );
    const ok = await readMonitorFrame(KEYED, 'QUJD', good.make);
    expect(good.keys).toEqual(['sk-ant-test']);
    expect(good.calls).toHaveLength(1);
    expect(ok).toEqual({
      ok: true,
      reading: { hr: 120, sbp: 90, dbp: 50, spo2: 88, rr: null, etco2: null, notes: '' },
    });

    const refused = client(() => Promise.resolve(message('', 'refusal')));
    expect(await readMonitorFrame(KEYED, 'QUJD', refused.make)).toEqual({
      ok: false,
      notice: 'Claude declined to read this frame.',
    });

    const garbled = client(() => Promise.resolve(message('{"hr":')));
    expect(await readMonitorFrame(KEYED, 'QUJD', garbled.make)).toMatchObject({ ok: false });

    const badKey = client(() => {
      throw new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
    });
    expect(await readMonitorFrame(KEYED, 'QUJD', badKey.make)).toEqual({
      ok: false,
      notice: 'The API key was rejected. Check it in Settings.',
    });
  });
});
