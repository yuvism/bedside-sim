/**
 * The teacher console's API and web app.
 *
 *   GET    /api/health           Gemini status and model
 *   POST   /api/videos           upload a video (multipart field "video")
 *   DELETE /api/videos/:id       remove an upload
 *   POST   /api/autofill         Gemini reads the video → timeline rows
 *   POST   /api/analyse          fit + proposals, streamed as NDJSON
 *   GET    /api/published        cases published to students (public)
 *   POST   /api/published        publish a case (validated)
 *   DELETE /api/published/:id    unpublish
 *   GET    /healthz              "ok" (for the host's health check)
 *
 * With TEACHER_PASSWORD set (needed online), everything except the published
 * list and the health check asks for that password (HTTP Basic sign-in).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { checkCase } from '../src/content/library.ts';
import type { CaseDef } from '../src/engine/types.ts';
import { parseReferenceCsv } from '../src/engine/validation/csv.ts';
import { analyse } from './analyse.ts';
import { actionCodes, buildPrompt, mockReply, REPLY_SCHEMA, replyToRows } from './autofill.ts';
import { LIBRARY } from './content.ts';
import {
  askGemini,
  AutofillError,
  geminiConfig,
  geminiStatus,
  isYoutubeUrl,
  type VideoSource,
} from './gemini.ts';
import {
  deletePublished,
  listPublished,
  newUploadId,
  readUploadMeta,
  removeUpload,
  saveUploadMeta,
  savePublished,
  uploadPath,
  type Store,
} from './store.ts';

export interface AppOptions {
  store: Store;
  env: Record<string, string | undefined>;
  /** Built teacher web app (dist-teacher), or null for API only. */
  distDir: string | null;
  bundled: readonly CaseDef[];
  /** The AMAX4 annotation, used by GEMINI_MOCK=1. */
  mockCsv: string;
}

const MAX_UPLOAD_MB = 500;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** True when an "Authorization: Basic …" header carries the password (any user name). */
export function hasPassword(header: string | undefined, password: string): boolean {
  const m = /^Basic\s+(.+)$/i.exec(header ?? '');
  if (!m?.[1] || !password) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);
  return timingSafeEqual(sha256(given), sha256(password));
}

export function createApp(o: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  const gemini = geminiConfig(o.env);
  const hosts = [
    ...(o.env['TEACHER_HOSTS'] ?? 'localhost,127.0.0.1,[::1]').split(','),
    // Render sets this to the service's own address (name.onrender.com).
    o.env['RENDER_EXTERNAL_HOSTNAME'] ?? '',
  ]
    .map((h) => h.trim())
    .filter(Boolean);
  const password = (o.env['TEACHER_PASSWORD'] ?? '').trim();

  const published = () =>
    listPublished(o.store).flatMap((raw) => {
      const r = checkCase(raw);
      return r.ok ? [r.value] : [];
    });

  /** A case from the request: full JSON (a draft) or the id of a known case. */
  function caseFrom(body: Record<string, unknown>): CaseDef {
    if (body['caseJson'] !== undefined) {
      const r = checkCase(body['caseJson']);
      if (!r.ok)
        throw new AutofillError(`The case has problems: ${r.issues.slice(0, 3).join('; ')}`, 400);
      return r.value;
    }
    const id = String(body['caseId'] ?? '');
    const c = published().find((x) => x.id === id) ?? o.bundled.find((x) => x.id === id);
    if (!c) throw new AutofillError(`Unknown case "${id}".`, 400);
    return c;
  }

  app.get('/healthz', (_req, res) => {
    res.type('text').send('ok');
  });

  // Online, only teachers with the password get in. Students' apps still read
  // the published list without it.
  if (password)
    app.use((req, res, next) => {
      if (req.method === 'GET' && req.path === '/api/published') return next();
      if (hasPassword(req.get('authorization'), password)) return next();
      res.set('WWW-Authenticate', 'Basic realm="Bedside sim teacher console", charset="UTF-8"');
      res.status(401).type('text').send('Teacher console: sign in with the teacher password.');
    });

  // Only this computer's names (guards against DNS rebinding), and a custom
  // header on every change so another website can't post to the console.
  app.use('/api', (req, res, next) => {
    if (!hosts.includes(req.hostname)) {
      res.status(403).json({ error: 'Unknown host.' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-bedside-teacher') !== '1') {
      res.status(403).json({ error: 'Missing the teacher console header.' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ gemini: geminiStatus(gemini), model: gemini.model, maxUploadMb: MAX_UPLOAD_MB });
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: o.store.uploads,
      filename: (_req, _file, cb) => cb(null, newUploadId()),
    }),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('video/')),
  });

  app.post('/api/videos', upload.single('video'), (req, res) => {
    const f = req.file;
    if (!f) {
      res.status(400).json({ error: 'Choose a video file (MP4, MOV, WebM…).' });
      return;
    }
    saveUploadMeta(o.store, f.filename, { mime: f.mimetype, size: f.size, created: Date.now() });
    res.status(201).json({ id: f.filename, size: f.size, mime: f.mimetype });
  });

  app.delete('/api/videos/:id', (req, res) => {
    res.json({ removed: removeUpload(o.store, req.params['id'] ?? '') });
  });

  app.post('/api/autofill', express.json({ limit: '5mb' }), async (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const videoId = typeof body['videoId'] === 'string' ? body['videoId'] : '';
    try {
      if (body['consent'] !== true)
        throw new AutofillError(
          'Confirm the video is public or de-identified and approved first.',
          400,
        );
      const c = caseFrom(body);
      let source: VideoSource;
      if (videoId) {
        const meta = readUploadMeta(o.store, videoId);
        if (!meta) throw new AutofillError('That upload has gone. Upload the video again.', 404);
        source = { kind: 'file', path: uploadPath(o.store, videoId), mime: meta.mime };
      } else if (typeof body['youtubeUrl'] === 'string' && isYoutubeUrl(body['youtubeUrl'])) {
        source = { kind: 'youtube', url: body['youtubeUrl'] };
      } else {
        throw new AutofillError('Upload a video or paste a public YouTube link.', 400);
      }
      // The teacher's "Scenario starts now", in video seconds, if they set one.
      const startSec = Number(body['startSec']);
      const start = Number.isFinite(startSec) && startSec > 0 ? Math.round(startSec) : null;
      const answer = gemini.mock
        ? { reply: mockReply(o.mockCsv, c, LIBRARY, start ?? 0), model: 'mock' }
        : await askGemini(source, buildPrompt(actionCodes(c, LIBRARY)), REPLY_SCHEMA, gemini);
      const result = replyToRows(answer.reply, c, LIBRARY, { start });
      res.json({ ...result, model: answer.model });
    } catch (err) {
      next(err);
    } finally {
      if (videoId) removeUpload(o.store, videoId);
    }
  });

  app.post('/api/analyse', express.json({ limit: '5mb' }), async (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    let c: CaseDef;
    let ref;
    try {
      c = caseFrom(body);
      ref = parseReferenceCsv(String(body['csv'] ?? ''));
      if (ref.rows.length === 0) throw new AutofillError('The timeline has no rows yet.', 400);
    } catch (err) {
      next(err instanceof AutofillError ? err : new AutofillError(String(err), 400));
      return;
    }
    const seed = Math.round(Number(body['seed'])) || 1;
    const name = String(body['name'] ?? 'Video').slice(0, 120);
    res.setHeader('Content-Type', 'application/x-ndjson');
    const line = (x: unknown) => res.write(`${JSON.stringify(x)}\n`);
    try {
      const result = await analyse(LIBRARY, c, ref, { seed, name }, (p) =>
        line({ type: 'progress', ...p }),
      );
      line({ type: 'result', ...result });
    } catch (err) {
      line({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    res.end();
  });

  app.get('/api/published', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(published());
  });

  app.post('/api/published', express.json({ limit: '5mb' }), (req, res) => {
    const r = checkCase((req.body as Record<string, unknown> | undefined)?.['caseJson']);
    if (!r.ok) {
      res.status(400).json({ error: 'This case has problems. Fix them first.', issues: r.issues });
      return;
    }
    try {
      savePublished(o.store, r.value.id, r.value);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    const replaces = o.bundled.some((c) => c.id === r.value.id);
    res.status(201).json({ id: r.value.id, title: r.value.title, replaces });
  });

  app.delete('/api/published/:id', (req, res) => {
    res.json({ removed: deletePublished(o.store, req.params['id'] ?? '') });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const dist = o.distDir;
  if (dist && existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method === 'GET') res.sendFile(join(dist, 'index.html'));
      else next();
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text')
        .send('Teacher console API is running. Build the web app with: npm run build:teacher');
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res
        .status(tooBig ? 413 : 400)
        .json({ error: tooBig ? `The video is larger than ${MAX_UPLOAD_MB} MB.` : err.message });
      return;
    }
    if (err instanceof AutofillError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const e = err as { type?: string; status?: number };
    if (e.type === 'entity.parse.failed' || e.status === 400) {
      res.status(400).json({ error: 'The request couldn’t be read.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
