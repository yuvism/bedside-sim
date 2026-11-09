/**
 * The optional AI patient: sends one free-text question to the Anthropic
 * Messages API straight from the browser, with the user's own key.
 *
 * The SDK is imported lazily, so nobody downloads it unless they turn the
 * feature on. Any failure (bad key, network, refusal, odd output) returns a
 * notice, and the caller falls back to the offline matcher.
 */
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { DEFAULT_MODEL, type AiSettings } from './aiSettings.ts';
import { NONE_ID, replySchema, type PatientPrompt } from './patientPrompt.ts';

export interface PatientClient {
  beta: { messages: { create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> } };
}

export type AskResult =
  { ok: true; questionId: string | null; reply: string } | { ok: false; notice: string };

/** Fallback beta: on a policy decline the API retries on its default fallback model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOKENS = 4000;
const MAX_REPLY_CHARS = 400;

async function sdk() {
  return import('@anthropic-ai/sdk');
}

export async function createClient(apiKey: string): Promise<PatientClient> {
  const { default: Anthropic } = await sdk();
  // The user's own key, called from their browser. The SDK adds the
  // anthropic-dangerous-direct-browser-access header for us.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 30_000 });
}

export function buildRequest(
  settings: AiSettings,
  prompt: PatientPrompt,
): MessageCreateParamsNonStreaming {
  return {
    model: settings.model.trim() || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: replySchema(prompt.ids) },
    },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  };
}

/** Reads the structured reply; null when it is missing or doesn't fit the schema. */
export function parseReply(
  msg: BetaMessage,
  ids: readonly string[],
): { questionId: string | null; reply: string } | null {
  const text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  try {
    const v = JSON.parse(text) as { reply?: unknown; questionId?: unknown };
    if (typeof v.reply !== 'string' || typeof v.questionId !== 'string') return null;
    const reply = v.reply.trim().slice(0, MAX_REPLY_CHARS);
    if (!reply || !ids.includes(v.questionId)) return null;
    return { questionId: v.questionId === NONE_ID ? null : v.questionId, reply };
  } catch {
    return null;
  }
}

export async function errorNotice(err: unknown): Promise<string> {
  const { APIError, APIConnectionError } = await sdk();
  if (err instanceof APIConnectionError) return 'Couldn’t reach the Anthropic API.';
  if (err instanceof APIError) {
    switch (err.status) {
      case 401:
        return 'The API key was rejected. Check it in Settings.';
      case 403:
        return 'This API key isn’t allowed to use that model.';
      case 404:
        return 'Model not found. Check the model name in Settings.';
      case 429:
        return 'Rate limited by the Anthropic API.';
      case 400:
        return `The API rejected the request: ${err.message}`;
      default:
        return `The Anthropic API returned an error (${err.status ?? 'unknown'}).`;
    }
  }
  return 'The AI patient failed unexpectedly.';
}

const OFFLINE = ' The offline patient answered instead.';

export async function askClaude(
  settings: AiSettings,
  prompt: PatientPrompt,
  makeClient: (apiKey: string) => Promise<PatientClient> = createClient,
): Promise<AskResult> {
  try {
    const client = await makeClient(settings.apiKey.trim());
    const msg = await client.beta.messages.create(buildRequest(settings, prompt));
    if (msg.stop_reason === 'refusal') {
      return { ok: false, notice: `Claude declined to answer.${OFFLINE}` };
    }
    const parsed = parseReply(msg, prompt.ids);
    if (!parsed) return { ok: false, notice: `Claude’s reply couldn’t be read.${OFFLINE}` };
    return { ok: true, ...parsed };
  } catch (err) {
    return { ok: false, notice: `${await errorNotice(err)}${OFFLINE}` };
  }
}
