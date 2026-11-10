import { draftTitle, listDrafts } from '../app/drafts.ts';
import { CASES, checkCase } from '../content/library.ts';
import type { CaseDef } from '../engine/types.ts';

export interface CaseOption {
  key: string;
  label: string;
  caseDef: CaseDef;
}

/** Library cases plus valid editor drafts, for pages that run a chosen case. */
export function caseOptions(): CaseOption[] {
  const lib = CASES.map((c) => ({ key: c.id, label: `${c.title} (${c.id})`, caseDef: c }));
  const drafts = listDrafts().flatMap((d) => {
    const r = checkCase(d.data);
    return r.ok
      ? [{ key: `draft:${d.id}`, label: `Draft: ${draftTitle(d)}`, caseDef: r.value }]
      : [];
  });
  return [...lib, ...drafts];
}
