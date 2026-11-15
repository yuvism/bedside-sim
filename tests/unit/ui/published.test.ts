import { describe, expect, it } from 'vitest';
import { loadPublished } from '../../../src/app/published.ts';
import { BUNDLED, CASES, getCase, isPublished } from '../../../src/content/cases.ts';

const reply = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;

describe('published cases in the student app', () => {
  it('adds valid cases, skips invalid ones and replaces a bundled case with the same id', async () => {
    const extra = { ...structuredClone(getCase('stemi-01')!), id: 'stemi-01-video' };
    const replaced = { ...structuredClone(getCase('hypo-01')!), title: 'Hypo (updated)' };
    const n = await loadPublished('http://localhost:8787/', reply([extra, replaced, { id: 'x' }]));
    expect(n).toBe(2);
    expect(CASES).toHaveLength(BUNDLED.length + 1);
    expect(getCase('stemi-01-video')).toBeDefined();
    expect(getCase('hypo-01')?.title).toBe('Hypo (updated)');
    expect(isPublished('hypo-01')).toBe(true);
    expect(isPublished('anaphylaxis-01')).toBe(false);
    expect(CASES.map((c) => c.id)).toEqual(CASES.map((c) => c.id).sort());
  });

  it('quietly keeps the built-in cases when the server is missing or odd', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await loadPublished('http://localhost:1', down)).toBe(0);
    expect(await loadPublished('http://x', reply({ not: 'a list' }))).toBe(0);
    expect(await loadPublished('http://x', reply([], false))).toBe(0);
  });
});
