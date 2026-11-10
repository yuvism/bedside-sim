/**
 * Optional: reads the patient monitor in one video frame with Claude (the
 * user's own key, called from the browser). Used by "Learn from a video" to
 * fill an annotation row. Only numbers that are clearly visible come back;
 * everything else is null, so a person still checks every reading.
 */
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { DEFAULT_MODEL, type AiSettings } from './aiSettings.ts';
import { createClient, errorNotice, FALLBACK_BETA, type PatientClient } from './claudePatient.ts';

export const MONITOR_KEYS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'etco2'] as const;
export type MonitorKey = (typeof MONITOR_KEYS)[number];
export type MonitorReading = Record<MonitorKey, number | null> & { notes: string };

const SYSTEM = [
  'You read bedside patient monitors in de-identified clinical training videos.',
  'Report only values you can clearly read on a monitor or on-screen vital-sign overlay in this frame. If a value is not shown, is unreadable or shows dashes or question marks, use null. Never estimate or infer a value from the clinical picture.',
  'hr: heart rate per minute. sbp and dbp: systolic and diastolic blood pressure in mmHg (arterial or cuff). spo2: oxygen saturation in %. rr: respiratory rate per minute. etco2: end-tidal CO2 in mmHg (convert kPa × 7.5 if the monitor shows kPa).',
  'notes: one short sentence on anything that affects the reading (for example a value flickering mid-change). Do not describe people.',
].join('\n');

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

export function buildVisionRequest(
  settings: AiSettings,
  jpegBase64: string,
): MessageCreateParamsNonStreaming {
  return {
    model: settings.model.trim() || DEFAULT_MODEL,
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            ...Object.fromEntries(MONITOR_KEYS.map((k) => [k, nullableNumber])),
            notes: { type: 'string' },
          },
          required: [...MONITOR_KEYS, 'notes'],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
          { type: 'text', text: 'Read the monitor values in this frame.' },
        ],
      },
    ],
  };
}

/** Plausible ranges; anything outside is treated as a misread. */
const RANGES: Record<MonitorKey, [number, number]> = {
  hr: [0, 300],
  sbp: [0, 300],
  dbp: [0, 250],
  spo2: [0, 100],
  rr: [0, 80],
  etco2: [0, 150],
};

export function parseVision(msg: BetaMessage): MonitorReading | null {
  const text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    const out = { notes: typeof v['notes'] === 'string' ? v['notes'] : '' } as MonitorReading;
    for (const k of MONITOR_KEYS) {
      const x = v[k];
      const [lo, hi] = RANGES[k];
      out[k] = typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
    }
    return out;
  } catch {
    return null;
  }
}

export async function readMonitorFrame(
  settings: AiSettings,
  jpegBase64: string,
  makeClient: (apiKey: string) => Promise<PatientClient> = createClient,
): Promise<{ ok: true; reading: MonitorReading } | { ok: false; notice: string }> {
  try {
    const client = await makeClient(settings.apiKey.trim());
    const msg = await client.beta.messages.create(buildVisionRequest(settings, jpegBase64));
    if (msg.stop_reason === 'refusal')
      return { ok: false, notice: 'Claude declined to read this frame.' };
    const reading = parseVision(msg);
    return reading
      ? { ok: true, reading }
      : { ok: false, notice: 'Claude’s reading couldn’t be understood.' };
  } catch (err) {
    return { ok: false, notice: await errorNotice(err) };
  }
}
