/**
 * Case content for the teacher server. The browser apps get the bundled
 * cases through Vite's import.meta.glob (src/content/cases.ts); Node reads
 * the same JSON files from disk and validates them with the same schema.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, parseCase } from '../src/content/library.ts';
import type { CaseDef } from '../src/engine/types.ts';

/** The project folder (one level up from server/). */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export { LIBRARY };

export function loadBundledCases(dir = join(ROOT, 'src', 'content', 'cases')): CaseDef[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => parseCase(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
    .sort((a, b) => a.id.localeCompare(b.id));
}
