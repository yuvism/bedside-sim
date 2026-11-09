import { getCase, LIBRARY } from '../../src/content/library.ts';
import type { ScriptStep } from '../../src/engine/replay.ts';
import type { CaseDef, Route } from '../../src/engine/types.ts';

export { LIBRARY };

export function caseById(id: string): CaseDef {
  const c = getCase(id);
  if (!c) throw new Error(`Case ${id} not found`);
  return c;
}

export const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

export const min = (m: number) => Math.round(m * 60);

export const drug = (t: number, drugId: string, route: Route, dose: number): ScriptStep => ({
  t,
  action: { kind: 'drug', drugId, route, dose },
});

export const imAdrenaline = (t: number) => drug(t, 'adrenaline', 'IM', 0.5);
