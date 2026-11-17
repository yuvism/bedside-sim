/**
 * Sends a video to Gemini and gets the monitor readings and team actions
 * back as JSON. Uses the teacher's own free key from .env (GEMINI_API_KEY);
 * the key stays on this server and never reaches the browser.
 *
 * Uploaded files are deleted from Google's File API straight after the
 * request, and the interaction is not stored (store: false).
 */
import { GoogleGenAI } from '@google/genai';

/** Tested on the AMAX4 video (free tier). */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
/**
 * Tried in order when the model before is busy (HTTP 500/503) or has used its
 * free requests (429). On the free tier each model family has its own daily
 * allowance (20 requests a day in November 2026; busy answers count too), so a
 * list keeps autofill working. Models that share an allowance are left out
 * (gemini-3.7-flash shares gemini-3.8-flash's, gemini-3.5-flash 3.6's).
 */
export const DEFAULT_FALLBACK_MODELS = 'gemini-3.8-flash,gemini-4-hydrogen,gemini-3.5-flash-lite';

export type VideoSource =
  { kind: 'file'; path: string; mime: string } | { kind: 'youtube'; url: string };

export type GeminiStatus = 'ready' | 'missing-key' | 'mock';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Models to try next, in order, when one is busy or out of free requests. */
  fallbackModels: string[];
  mock: boolean;
}

export function geminiConfig(env: Record<string, string | undefined>): GeminiConfig {
  return {
    apiKey: (env['GEMINI_API_KEY'] ?? '').trim(),
    model: (env['GEMINI_MODEL'] ?? '').trim() || DEFAULT_GEMINI_MODEL,
    // A comma-separated list; set it to nothing to use the main model only.
    fallbackModels: (env['GEMINI_FALLBACK_MODEL'] ?? DEFAULT_FALLBACK_MODELS)
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    mock: env['GEMINI_MOCK'] === '1',
  };
}

export const geminiStatus = (c: GeminiConfig): GeminiStatus =>
  c.mock ? 'mock' : c.apiKey ? 'ready' : 'missing-key';

/** A failure with a message a teacher can act on, and the HTTP status to send. */
export class AutofillError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AutofillError';
    this.status = status;
  }
}

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/;
export const isYoutubeUrl = (s: string) => YOUTUBE.test(s.trim());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const statusOf = (err: unknown) => (err as { status?: unknown }).status;
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
/** Google's "high demand, try later" answers. */
const isBusy = (err: unknown) => statusOf(err) === 503 || statusOf(err) === 500;
/** No answer within MODEL_TIMEOUT_MS. */
const timedOut = (err: unknown) =>
  /timeout/i.test((err as { name?: string }).name ?? '') || /timed out/i.test(messageOf(err));
/** Busy, slow, or out of free requests: another model may still answer. */
const tryNext = (err: unknown) => isBusy(err) || statusOf(err) === 429 || timedOut(err);
/**
 * How long one model may take to answer before the next is tried. Gemini 4
 * Hydrogen took up to 4 minutes for a 14-minute video; one that hasn't
 * answered in 6 is stuck.
 */
const MODEL_TIMEOUT_MS = 6 * 60_000;

/** "Please retry in 13h20m12s" → "13h 20m" (or null). */
export function retryWait(msg: string): string | null {
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(msg);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  if (m[1]) return `${m[1]}h ${m[2] ?? '0'}m`;
  if (m[2]) return `${m[2]} min`;
  return 'a minute';
}

export interface ModelFailure {
  model: string;
  status: number;
  message: string;
}

/** One plain message for when every model was busy or out of free requests. */
export function noModelLeft(fails: readonly ModelFailure[]): AutofillError {
  const n = fails.length;
  const busy = fails.filter((f) => f.status >= 500).length;
  const limited = fails.filter((f) => f.status === 429);
  const daily = limited.filter((f) => /per day/i.test(f.message));
  const wait = daily.map((f) => retryWait(f.message)).find(Boolean);
  const resets = wait ? ` (it resets in about ${wait})` : '';
  const models = n === 1 ? `Gemini (${fails[0]?.model ?? ''})` : `all ${n} Gemini models`;
  if (busy === n)
    return new AutofillError(
      `${n === 1 ? 'Gemini is' : `All ${n} Gemini models are`} busy right now (high demand). Try again in a minute or two.`,
      503,
    );
  if (daily.length === n)
    return new AutofillError(
      `Today’s free Gemini requests are used up on ${models}${resets}. Try again then, or use another free key.`,
      429,
    );
  if (busy === 0)
    return new AutofillError(
      `Gemini’s free-tier limit was reached on ${models}. Wait ${retryWait(limited[0]?.message ?? '') ?? 'a minute'} and try again.`,
      429,
    );
  return new AutofillError(
    `No free Gemini model could take the video just now: ${busy} ${busy === 1 ? 'is' : 'are'} busy and ${limited.length} ${limited.length === 1 ? 'has' : 'have'} used ${limited.length === 1 ? 'its' : 'their'} free requests${resets}. Try again in a few minutes.`,
    503,
  );
}

function friendly(err: unknown, model: string): AutofillError {
  if (err instanceof AutofillError) return err;
  const status = statusOf(err);
  const msg = messageOf(err);
  if (isBusy(err) || status === 429)
    return noModelLeft([{ model, status: Number(status), message: msg }]);
  if (status === 401 || status === 403 || /api key/i.test(msg))
    return new AutofillError(
      'Gemini didn’t accept the API key. Check GEMINI_API_KEY in .env.',
      401,
    );
  if (status === 404)
    return new AutofillError(
      `The model "${model}" isn’t available for this key. Set GEMINI_MODEL in .env.`,
      400,
    );
  return new AutofillError(`Gemini request failed: ${msg.slice(0, 300)}`);
}

/**
 * Asks Gemini about a video and returns its parsed JSON answer and the model
 * that gave it. When a model is busy or out of free requests, the next is tried.
 */
export async function askGemini(
  source: VideoSource,
  prompt: string,
  schema: Record<string, unknown>,
  cfg: GeminiConfig,
): Promise<{ reply: unknown; model: string }> {
  if (!cfg.apiKey)
    throw new AutofillError(
      'No Gemini key yet. Add GEMINI_API_KEY to the .env file and restart the server.',
      503,
    );
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  let uploaded: string | undefined;
  try {
    let video: { type: 'video'; uri: string; mime_type?: string };
    if (source.kind === 'file') {
      // A neutral display name: the original file name may identify someone.
      let f = await ai.files.upload({
        file: source.path,
        config: { mimeType: source.mime, displayName: 'training-video' },
      });
      uploaded = f.name;
      const deadline = Date.now() + 10 * 60_000;
      while (f.state === 'PROCESSING') {
        if (Date.now() > deadline)
          throw new AutofillError('Gemini took too long to process the video.', 504);
        await sleep(3000);
        f = await ai.files.get({ name: uploaded ?? '' });
      }
      if (f.state === 'FAILED' || !f.uri)
        throw new AutofillError('Gemini couldn’t process this video file.', 422);
      video = { type: 'video', uri: f.uri, mime_type: f.mimeType ?? source.mime };
    } else {
      video = { type: 'video', uri: source.url.trim() };
    }

    const models = [...new Set([cfg.model, ...cfg.fallbackModels].filter(Boolean))];
    const fails: ModelFailure[] = [];
    for (let i = 0; ; i++) {
      const model = models[i] ?? cfg.model;
      let text: string;
      try {
        const interaction = await ai.interactions.create(
          {
            model,
            store: false,
            // The stable (v1) Interactions API takes one user-input step holding
            // the video and the instructions, the video first.
            input: [
              {
                type: 'user_input',
                content: [
                  { ...video, processing: { type: 'static', fps: 1 } },
                  { type: 'text', text: prompt },
                ],
              },
            ],
            response_format: { type: 'text', mime_type: 'application/json', schema },
          },
          // No silent retries: each one resends the whole video and counts
          // against the free daily limit. We move to the next model instead.
          { retries: { strategy: 'none' }, timeout_ms: MODEL_TIMEOUT_MS },
        );
        text = interaction.output_text ?? '';
      } catch (err) {
        if (!tryNext(err)) throw friendly(err, model);
        const status = timedOut(err) ? 504 : Number(statusOf(err));
        fails.push({ model, status, message: messageOf(err) });
        if (i + 1 < models.length) {
          console.warn(`Gemini ${model}: HTTP ${status}, trying ${models[i + 1]}`);
          continue;
        }
        throw noModelLeft(fails);
      }
      try {
        return { reply: JSON.parse(text) as unknown, model };
      } catch {
        throw new AutofillError('Gemini’s answer couldn’t be read. Try again.', 502);
      }
    }
  } catch (err) {
    throw friendly(err, cfg.model);
  } finally {
    if (uploaded) await ai.files.delete({ name: uploaded }).catch(() => undefined);
  }
}
