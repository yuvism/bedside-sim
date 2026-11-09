/** Loads and validates the shared library and the bundled cases. */
import type { CaseDef, EngineLibrary } from '../engine/types.ts';
import devicesJson from './devices.json';
import formularyJson from './formulary.json';
import investigationsJson from './investigations.json';
import {
  CaseSchema,
  DeviceTableSchema,
  FormularySchema,
  InvestigationTableSchema,
} from './schema.ts';
import { validateCaseRefs } from './validate.ts';

export class ContentError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(`${message}\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ContentError';
    this.issues = issues;
  }
}

export function parseLibrary(raw: {
  formulary: unknown;
  devices: unknown;
  investigations: unknown;
}): EngineLibrary {
  return {
    formulary: FormularySchema.parse(raw.formulary),
    devices: DeviceTableSchema.parse(raw.devices),
    investigations: InvestigationTableSchema.parse(raw.investigations),
  };
}

export const LIBRARY: EngineLibrary = parseLibrary({
  formulary: formularyJson,
  devices: devicesJson,
  investigations: investigationsJson,
});

/** Schema + cross-reference validation. Returns readable issues instead of throwing. */
export function checkCase(
  raw: unknown,
  lib: EngineLibrary = LIBRARY,
): { ok: true; value: CaseDef } | { ok: false; issues: string[] } {
  const parsed = CaseSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, issues };
  }
  const refs = validateCaseRefs(parsed.data, lib);
  return refs.length ? { ok: false, issues: refs } : { ok: true, value: parsed.data };
}

export function parseCase(raw: unknown, lib: EngineLibrary = LIBRARY): CaseDef {
  const r = checkCase(raw, lib);
  if (!r.ok) throw new ContentError('Invalid case file', r.issues);
  return r.value;
}

const modules = import.meta.glob<unknown>('./cases/*.json', { eager: true, import: 'default' });

/** All bundled cases, sorted by id. */
export const CASES: CaseDef[] = Object.values(modules)
  .map((raw) => parseCase(raw))
  .sort((a, b) => a.id.localeCompare(b.id));

export function getCase(id: string): CaseDef | undefined {
  return CASES.find((c) => c.id === id);
}
