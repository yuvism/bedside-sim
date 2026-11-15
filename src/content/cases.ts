/**
 * The cases students can play: the bundled library, plus any cases teachers
 * have published from the teacher console. Published cases are added once,
 * before the app renders (see src/main.tsx), so every list of cases sees them.
 *
 * Kept apart from library.ts because `import.meta.glob` only works in Vite;
 * the teacher server reads the same JSON files from disk instead.
 */
import type { CaseDef } from '../engine/types.ts';
import { checkCase, parseCase } from './library.ts';

const modules = import.meta.glob<unknown>('./cases/*.json', { eager: true, import: 'default' });

const byId = (a: CaseDef, b: CaseDef) => a.id.localeCompare(b.id);

/** The cases shipped with the app, sorted by id. */
export const BUNDLED: readonly CaseDef[] = Object.values(modules)
  .map((raw) => parseCase(raw))
  .sort(byId);

/** Every playable case, sorted by id. */
export const CASES: CaseDef[] = [...BUNDLED];

const published = new Set<string>();

export function getCase(id: string): CaseDef | undefined {
  return CASES.find((c) => c.id === id);
}

/** True for a case that came from the teacher console rather than the bundle. */
export const isPublished = (id: string): boolean => published.has(id);

/**
 * Adds cases published by teachers. Each is validated first; invalid ones are
 * skipped. A published case replaces a bundled case with the same id.
 */
export function addPublished(list: readonly unknown[]): { added: string[]; skipped: number } {
  const added: string[] = [];
  let skipped = 0;
  for (const raw of list) {
    const r = checkCase(raw);
    if (!r.ok) {
      skipped++;
      continue;
    }
    const i = CASES.findIndex((c) => c.id === r.value.id);
    if (i >= 0) CASES[i] = r.value;
    else CASES.push(r.value);
    published.add(r.value.id);
    added.push(r.value.id);
  }
  CASES.sort(byId);
  return { added, skipped };
}
