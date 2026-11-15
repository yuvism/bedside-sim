/**
 * Calls from the teacher console to its server (same origin: the server
 * serves this app). Every change carries the console header the server
 * requires, so other websites can't post to it.
 */
import type { FitProgress, FitResult } from '../engine/learning/fit.ts';
import type { Addition } from '../engine/learning/propose.ts';
import type { RefVital } from '../engine/validation/csv.ts';

export interface Health {
  gemini: 'ready' | 'missing-key' | 'mock';
  model: string;
  maxUploadMb: number;
}

export interface AutofillRow {
  t: number;
  values: Record<RefVital, number | null>;
  event: string;
}

export interface AutofillReply {
  rows: AutofillRow[];
  notes: string;
  unmatched: number;
  model: string;
}

export interface Analysis {
  fit: FitResult;
  additions: Addition[];
}

export class ApiError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.issues = issues;
  }
}

const WRITE = { 'x-bedside-teacher': '1' };
const JSON_WRITE = { ...WRITE, 'content-type': 'application/json' };

async function call(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError('Can’t reach the teacher server. Start it with: npm run server');
  }
}

async function json<T>(r: Response): Promise<T> {
  const body = (await r.json().catch(() => ({}))) as { error?: string; issues?: string[] };
  if (!r.ok) throw new ApiError(body.error ?? `Server error ${r.status}`, body.issues ?? []);
  return body as T;
}

export const getHealth = async () => json<Health>(await call('/api/health'));

export async function uploadVideo(file: File): Promise<{ id: string }> {
  const form = new FormData();
  form.append('video', file);
  return json(await call('/api/videos', { method: 'POST', headers: WRITE, body: form }));
}

export async function autofill(body: {
  videoId?: string;
  youtubeUrl?: string;
  caseJson: unknown;
  consent: boolean;
}): Promise<AutofillReply> {
  return json(
    await call('/api/autofill', {
      method: 'POST',
      headers: JSON_WRITE,
      body: JSON.stringify(body),
    }),
  );
}

/** Runs the fit on the server, reading its NDJSON progress lines as they arrive. */
export async function analyseOnServer(
  body: { caseJson: unknown; csv: string; seed: number; name: string },
  onProgress: (p: FitProgress) => void,
): Promise<Analysis> {
  const r = await call('/api/analyse', {
    method: 'POST',
    headers: JSON_WRITE,
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) return json(r);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { type: string; error?: string } & FitProgress & Analysis;
      if (msg.type === 'progress') onProgress(msg);
      else if (msg.type === 'result') return { fit: msg.fit, additions: msg.additions };
      else if (msg.type === 'error') throw new ApiError(msg.error ?? 'The analysis failed.');
    }
    if (done) throw new ApiError('The analysis stopped before it finished.');
  }
}

export const listPublished = async () => json<unknown[]>(await call('/api/published'));

export async function publishCase(
  caseJson: unknown,
): Promise<{ id: string; title: string; replaces: boolean }> {
  return json(
    await call('/api/published', {
      method: 'POST',
      headers: JSON_WRITE,
      body: JSON.stringify({ caseJson }),
    }),
  );
}

export async function unpublish(id: string): Promise<{ removed: boolean }> {
  return json(
    await call(`/api/published/${encodeURIComponent(id)}`, { method: 'DELETE', headers: WRITE }),
  );
}
