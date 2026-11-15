/**
 * Sends a video to Gemini and gets the monitor readings and team actions
 * back as JSON. Uses the teacher's own free key from .env (GEMINI_API_KEY);
 * the key stays on this server and never reaches the browser.
 *
 * Uploaded files are deleted from Google's File API straight after the
 * request, and the interaction is not stored (store: false).
 */
import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export type VideoSource =
  { kind: 'file'; path: string; mime: string } | { kind: 'youtube'; url: string };

export type GeminiStatus = 'ready' | 'missing-key' | 'mock';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  mock: boolean;
}

export function geminiConfig(env: Record<string, string | undefined>): GeminiConfig {
  return {
    apiKey: (env['GEMINI_API_KEY'] ?? '').trim(),
    model: (env['GEMINI_MODEL'] ?? '').trim() || DEFAULT_GEMINI_MODEL,
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

function friendly(err: unknown, model: string): AutofillError {
  if (err instanceof AutofillError) return err;
  const status = (err as { status?: unknown }).status;
  const msg = err instanceof Error ? err.message : String(err);
  if (status === 429)
    return new AutofillError(
      'Gemini’s free-tier limit was reached. Wait a minute (or until tomorrow for the daily limit) and try again.',
      429,
    );
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

/** Asks Gemini about a video and returns its parsed JSON answer. */
export async function askGemini(
  source: VideoSource,
  prompt: string,
  schema: Record<string, unknown>,
  cfg: GeminiConfig,
): Promise<unknown> {
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

    const interaction = await ai.interactions.create({
      model: cfg.model,
      store: false,
      input: [
        { ...video, processing: { type: 'static', fps: 1 } },
        { type: 'text', text: prompt },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema },
    });
    const text = interaction.output_text ?? '';
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AutofillError('Gemini’s answer couldn’t be read. Try again.', 502);
    }
  } catch (err) {
    throw friendly(err, cfg.model);
  } finally {
    if (uploaded) await ai.files.delete({ name: uploaded }).catch(() => undefined);
  }
}
