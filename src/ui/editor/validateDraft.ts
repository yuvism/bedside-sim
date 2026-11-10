/**
 * Live validation for the editor: the Zod case schema (with paths, so errors
 * sit next to their fields) and then the cross-reference checks against the
 * shared library.
 */
import { LIBRARY } from '../../content/library.ts';
import { CaseSchema } from '../../content/schema.ts';
import { validateCaseRefs } from '../../content/validate.ts';
import type { CaseDef, EngineLibrary } from '../../engine/types.ts';

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

export interface DraftCheck {
  ok: boolean;
  value: CaseDef | null;
  issues: FieldIssue[];
  /** Cross-reference problems (unknown ids and duplicates); no field path. */
  refIssues: string[];
}

interface ZodIssueLike {
  code: string;
  path: PropertyKey[];
  message: string;
  minimum?: unknown;
  origin?: string;
  input?: unknown;
  keys?: string[];
}

export function friendlyMessage(i: ZodIssueLike): string {
  if (i.code === 'invalid_type' && i.input === undefined) return 'Required.';
  if (i.code === 'too_small' && i.origin === 'string' && i.minimum === 1) return 'Required.';
  if (i.code === 'too_small' && i.origin === 'array') return `Needs at least ${String(i.minimum)}.`;
  if (i.code === 'invalid_union')
    return 'Doesn’t match any allowed type. Pick a type and fill it in.';
  if (i.code === 'unrecognized_keys') return `Unknown field: ${(i.keys ?? []).join(', ')}.`;
  return i.message;
}

export function checkDraft(data: unknown, lib: EngineLibrary = LIBRARY): DraftCheck {
  const parsed = CaseSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.map((p) => (typeof p === 'number' ? p : String(p))),
      message: friendlyMessage(i as unknown as ZodIssueLike),
    }));
    return { ok: false, value: null, issues, refIssues: [] };
  }
  const refIssues = validateCaseRefs(parsed.data, lib);
  return { ok: refIssues.length === 0, value: parsed.data, issues: [], refIssues };
}
