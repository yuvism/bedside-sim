import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyOfCase,
  deleteDraft,
  DRAFTS_KEY,
  getDraft,
  listDrafts,
  newDraft,
  saveDraft,
} from '../../../src/app/drafts.ts';
import { templateCase } from '../../../src/ui/editor/template.ts';
import { parseHash } from '../../../src/app/router.ts';
import { CASES, LIBRARY } from '../../../src/content/library.ts';
import { CaseSchema, ConditionSchema, RuleTestSchema } from '../../../src/content/schema.ts';
import { indexIssues } from '../../../src/ui/editor/form/context.ts';
import {
  defaultFor,
  discriminatorOf,
  minItems,
  numberBounds,
  optionsOf,
  resolve,
  shapeOf,
  unwrap,
  variantIndex,
} from '../../../src/ui/editor/form/introspect.ts';
import { itemSummary, singularFor } from '../../../src/ui/editor/form/labels.ts';
import { SECTIONS, sectionOfKey } from '../../../src/ui/editor/sections.ts';
import { buildLists, listFor } from '../../../src/ui/editor/suggestions.ts';
import { checkDraft } from '../../../src/ui/editor/validateDraft.ts';

describe('editor sections', () => {
  it('cover every field of the case schema exactly once', () => {
    const keys = SECTIONS.flatMap((s) => s.keys);
    expect([...keys].sort()).toEqual(Object.keys(CaseSchema.shape).sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(sectionOfKey('dialogue')).toBe('talk');
    expect(sectionOfKey('nope')).toBe('raw');
  });
});

describe('schema introspection', () => {
  it('builds a starting case with every required field', () => {
    const d = defaultFor(CaseSchema) as Record<string, unknown>;
    for (const [k, s] of Object.entries(CaseSchema.shape)) {
      if (!unwrap(s).optional) expect(d, k).toHaveProperty(k);
    }
    expect(d['schemaVersion']).toBe(1);
    expect((d['processes'] as unknown[]).length).toBe(1);
  });

  it.each([
    ['conditions', ConditionSchema],
    ['scoring tests', RuleTestSchema],
  ])('recognises every type of %s from its starting value', (_n, union) => {
    const opts = optionsOf(resolve(union));
    expect(opts.length).toBeGreaterThan(10);
    opts.forEach((o, i) => expect(variantIndex(union, defaultFor(o))).toBe(i));
    expect(variantIndex(union, 'x')).toBe(-1);
  });

  it('reads discriminators, list minimums and number bounds', () => {
    expect(discriminatorOf(RuleTestSchema)).toBe('type');
    expect(discriminatorOf(ConditionSchema)).toBeNull();
    expect(minItems(CaseSchema.shape.brief)).toBe(1);
    const age = shapeOf(CaseSchema.shape.patient)['age'];
    expect(age && numberBounds(age)).toEqual({ min: 0, max: 120, int: false });
    expect(unwrap(CaseSchema.shape.variation).optional).toBe(true);
  });
});

describe('draft validation', () => {
  it('passes every library case and the template', () => {
    for (const c of CASES) expect(checkDraft(c).ok, c.id).toBe(true);
    expect(checkDraft(templateCase()).ok).toBe(true);
  });

  it('puts schema problems on their fields with plain messages', () => {
    const t = templateCase() as Record<string, unknown>;
    const r = checkDraft({ ...t, title: '', brief: [] });
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({ path: ['title'], message: 'Required.' });
    expect(r.issues).toContainEqual({ path: ['brief'], message: 'Needs at least 1.' });
  });

  it('reports unknown ids separately', () => {
    const t = templateCase() as { bands: { process: string } };
    const r = checkDraft({ ...t, bands: { ...t.bands, process: 'missing' } });
    expect(r.ok).toBe(false);
    expect(r.refIssues.join(' ')).toMatch(/missing/);
  });

  it('indexes issues by field and by section', () => {
    const idx = indexIssues([{ path: ['scoring', 2, 'label'], message: 'Required.' }]);
    expect(idx.at(['scoring', 2, 'label'])).toEqual(['Required.']);
    expect(idx.under(['scoring', 2])).toBe(true);
    expect(idx.under(['scoring', 1])).toBe(false);
  });
});

describe('suggestions and labels', () => {
  const data = templateCase();
  const lists = buildLists(data, LIBRARY);

  it('offers library and case ids', () => {
    expect(lists['drugs']).toContain('adrenaline');
    expect(lists['processes']).toEqual(['illness']);
    expect(lists['codes']).toEqual(
      expect.arrayContaining(['talk:allergy', 'exam:A', 'order:glu', 'device:o2_nrb:on']),
    );
  });

  it('picks the list from the field and the test type', () => {
    expect(listFor('drugGiven', ['hints', 0, 'when', 'drugGiven'], data)).toBe('drugs');
    expect(listFor('id', ['investigations', 0, 'id'], data)).toBe('investigations');
    const scoring = { scoring: [{ test: { type: 'asked', ids: [''] } }] };
    expect(listFor('ids', ['scoring', 0, 'test', 'ids', 0], scoring)).toBe('dialogue');
    expect(listFor('title', ['title'], data)).toBeUndefined();
  });

  it('names list items sensibly', () => {
    expect(singularFor('processes')).toBe('process');
    expect(singularFor('scoring')).toBe('rule');
    expect(singularFor('effects')).toBe('effect');
    expect(itemSummary({ target: 'hr', perPoint: 0.6 }, 0)).toBe('hr: +0.6 per point');
    expect(itemSummary({ id: 'x', label: 'Oxygen given' }, 0)).toBe('x: Oxygen given');
  });
});

describe('editor routes', () => {
  it('parses the editor and test-run routes', () => {
    expect(parseHash('#/editor')).toEqual({ name: 'editor' });
    expect(parseHash('#/editor/d123')).toEqual({ name: 'edit', draftId: 'd123' });
    expect(parseHash('#/test/d123?seed=9')).toEqual({ name: 'test', draftId: 'd123', seed: 9 });
  });
});

describe('draft storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(setItem?: () => void) {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: setItem ?? ((k: string, v: string) => data.set(k, v)),
        removeItem: (k: string) => data.delete(k),
      },
    });
    return data;
  }

  it('saves, lists newest first, loads and deletes', () => {
    const data = stub();
    const a = { ...newDraft({ id: 'a' }), updated: 1 };
    const b = { ...newDraft({ id: 'b' }), updated: 2 };
    expect(saveDraft(a)).toBeNull();
    expect(saveDraft(b)).toBeNull();
    expect(listDrafts().map((d) => d.id)).toEqual([b.id, a.id]);
    expect(getDraft(a.id)?.data).toEqual({ id: 'a' });
    expect(deleteDraft(a.id)).toBeNull();
    expect(listDrafts()).toHaveLength(1);
    expect(data.has(DRAFTS_KEY)).toBe(true);
  });

  it('reports a full browser storage instead of throwing', () => {
    stub(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveDraft(newDraft({}))).toMatch(/storage is full/);
  });

  it('copies a case under a new id and title', () => {
    const c = copyOfCase({ id: 'x-01', title: 'Thing' }) as { id: string; title: string };
    expect(c).toEqual({ id: 'x-01-copy', title: 'Thing (copy)' });
  });
});
