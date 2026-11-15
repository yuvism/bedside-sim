import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/app.ts';
import { loadBundledCases } from '../../../server/content.ts';
import { askGemini, AutofillError, geminiConfig } from '../../../server/gemini.ts';
import { openStore, type Store } from '../../../server/store.ts';
import { getCase } from '../../../src/content/cases.ts';

const CSV = readFileSync('src/content/validation/amax4-simulation-annotation.csv', 'utf8');
const W = { 'x-bedside-teacher': '1' };
const JW = { ...W, 'content-type': 'application/json' };

let dir: string;
let store: Store;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bedside-api-'));
  store = openStore(dir);
  const app = createApp({
    store,
    env: { GEMINI_MOCK: '1' },
    distDir: null,
    bundled: loadBundledCases(),
    mockCsv: CSV,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: JW, body: JSON.stringify(body) });

const video = () => {
  const form = new FormData();
  form.append('video', new Blob([new Uint8Array(64)], { type: 'video/mp4' }), 'clip.mp4');
  return form;
};

const upload = async () => {
  const r = await fetch(`${base}/api/videos`, { method: 'POST', headers: W, body: video() });
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: string }).id;
};

describe('teacher server', () => {
  it('reports Gemini status', async () => {
    const h = (await (await fetch(`${base}/api/health`)).json()) as { gemini: string };
    expect(h.gemini).toBe('mock');
  });

  it('refuses changes without the console header', async () => {
    const r = await fetch(`${base}/api/published`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(403);
  });

  it('refuses requests for another host name', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${base}/api/health`, { headers: { host: 'evil.example' } }, (res) =>
        resolve(res.statusCode ?? 0),
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it('accepts only video uploads', async () => {
    const form = new FormData();
    form.append('video', new Blob(['hi'], { type: 'text/plain' }), 'notes.txt');
    const r = await fetch(`${base}/api/videos`, { method: 'POST', headers: W, body: form });
    expect(r.status).toBe(400);
  });

  it('needs consent before autofill', async () => {
    const id = await upload();
    const r = await post('/api/autofill', { videoId: id, caseId: 'asthma-02' });
    expect(r.status).toBe(400);
  });

  it('autofills from an upload and deletes the upload afterwards', async () => {
    const id = await upload();
    expect(readdirSync(store.uploads)).toContain(id);
    const r = await post('/api/autofill', { videoId: id, caseId: 'asthma-02', consent: true });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { rows: unknown[]; model: string };
    expect(body.model).toBe('mock');
    expect(body.rows.length).toBeGreaterThan(10);
    expect(readdirSync(store.uploads).some((f) => f.startsWith(id))).toBe(false);
  });

  it('accepts a YouTube link and rejects other links', async () => {
    const ok = await post('/api/autofill', {
      youtubeUrl: 'https://www.youtube.com/watch?v=o3NDS3snnxc',
      caseId: 'asthma-02',
      consent: true,
    });
    expect(ok.status).toBe(200);
    const bad = await post('/api/autofill', {
      youtubeUrl: 'https://example.com/video.mp4',
      caseId: 'asthma-02',
      consent: true,
    });
    expect(bad.status).toBe(400);
  });

  it('streams the analysis and ends with the fit and proposals', async () => {
    const r = await post('/api/analyse', { caseId: 'asthma-01', csv: CSV, seed: 1, name: 'AMAX4' });
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await r.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { type: string; fit?: { rmseAfter: { hr: number } } });
    expect(lines.some((l) => l.type === 'progress')).toBe(true);
    const last = lines.at(-1);
    expect(last?.type).toBe('result');
    expect(last?.fit?.rmseAfter.hr).toBeGreaterThan(0);
  });

  it('publishes valid cases only, and lists them for any origin', async () => {
    const bad = await post('/api/published', { caseJson: { id: 'x' } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { issues: string[] }).issues.length).toBeGreaterThan(0);

    const c = { ...structuredClone(getCase('hypo-01')!), id: 'hypo-01-video', title: 'Changed' };
    const ok = await post('/api/published', { caseJson: c });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ id: 'hypo-01-video', replaces: false });

    const list = await fetch(`${base}/api/published`);
    expect(list.headers.get('access-control-allow-origin')).toBe('*');
    expect(((await list.json()) as { id: string }[]).map((x) => x.id)).toEqual(['hypo-01-video']);

    const del = await fetch(`${base}/api/published/hypo-01-video`, {
      method: 'DELETE',
      headers: W,
    });
    expect(await del.json()).toEqual({ removed: true });
  });
});

describe('Gemini client', () => {
  it('explains a missing key without calling Google', async () => {
    const cfg = geminiConfig({});
    expect(cfg.model).toBe('gemini-4-hydrogen');
    await expect(
      askGemini({ kind: 'youtube', url: 'https://youtu.be/abcdefg' }, 'p', {}, cfg),
    ).rejects.toBeInstanceOf(AutofillError);
  });
});
