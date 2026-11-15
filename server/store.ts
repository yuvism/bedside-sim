/**
 * The teacher server's storage: plain files in one data folder.
 *
 *   uploads/<id>        a video waiting for autofill (deleted afterwards)
 *   uploads/<id>.json   its type and size
 *   published/<id>.json a case published to students
 *
 * Uploaded videos never stay long: autofill deletes them, and anything older
 * than an hour is removed when the server starts.
 */
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface Store {
  dir: string;
  uploads: string;
  published: string;
}

export interface UploadMeta {
  mime: string;
  size: number;
  created: number;
}

const UPLOAD_ID = /^[a-f0-9]{16}$/;
const CASE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

export const isUploadId = (id: string) => UPLOAD_ID.test(id);
export const isSafeCaseId = (id: string) => CASE_ID.test(id);
export const newUploadId = () => randomBytes(8).toString('hex');

export function openStore(dir: string): Store {
  const s = { dir, uploads: join(dir, 'uploads'), published: join(dir, 'published') };
  mkdirSync(s.uploads, { recursive: true });
  mkdirSync(s.published, { recursive: true });
  return s;
}

/** Removes uploads older than maxAgeMs. Returns how many files went. */
export function sweepUploads(s: Store, maxAgeMs = 60 * 60 * 1000, now = Date.now()): number {
  let n = 0;
  for (const f of readdirSync(s.uploads)) {
    const p = join(s.uploads, f);
    if (now - statSync(p).mtimeMs > maxAgeMs) {
      rmSync(p, { force: true });
      n++;
    }
  }
  return n;
}

export const uploadPath = (s: Store, id: string) => join(s.uploads, id);

export function saveUploadMeta(s: Store, id: string, meta: UploadMeta): void {
  writeFileSync(join(s.uploads, `${id}.json`), JSON.stringify(meta));
}

export function readUploadMeta(s: Store, id: string): UploadMeta | null {
  if (!isUploadId(id)) return null;
  const p = join(s.uploads, `${id}.json`);
  if (!existsSync(p) || !existsSync(uploadPath(s, id))) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as UploadMeta;
  } catch {
    return null;
  }
}

export function removeUpload(s: Store, id: string): boolean {
  if (!isUploadId(id)) return false;
  const had = existsSync(uploadPath(s, id));
  rmSync(uploadPath(s, id), { force: true });
  rmSync(join(s.uploads, `${id}.json`), { force: true });
  return had;
}

/** Published cases, as raw JSON (validated again by whoever loads them). */
export function listPublished(s: Store): unknown[] {
  return readdirSync(s.published)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(s.published, f), 'utf8')) as unknown];
      } catch {
        return [];
      }
    });
}

export function savePublished(s: Store, id: string, data: unknown): void {
  if (!isSafeCaseId(id)) throw new Error(`Case id "${id}" can't be used as a file name.`);
  writeFileSync(join(s.published, `${id}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

export function deletePublished(s: Store, id: string): boolean {
  if (!isSafeCaseId(id)) return false;
  const p = join(s.published, `${id}.json`);
  const had = existsSync(p);
  rmSync(p, { force: true });
  return had;
}
