import { describe, expect, it } from 'vitest';
import { templateCase } from '../../../src/ui/editor/template.ts';
import { checkCase } from '../../../src/content/library.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { LIBRARY, min } from '../helpers.ts';

describe('new-case template', () => {
  const r = checkCase(templateCase());

  it('is a valid case', () => {
    expect(r.ok ? [] : r.issues).toEqual([]);
  });

  it('stabilises with high-flow oxygen and arrests without treatment', () => {
    if (!r.ok) throw new Error('invalid template');
    for (const seed of [1, 2, 3, 4, 5]) {
      const oxygen = runScript(
        LIBRARY,
        r.value,
        seed,
        [{ t: 30, action: { kind: 'device', deviceId: 'o2_nrb', on: true } }],
        { maxSec: min(30) },
      );
      expect(oxygen.outcome, `seed ${seed}`).toBe('stabilised');
      const none = runScript(LIBRARY, r.value, seed, [], { maxSec: min(60), stopOnArrest: true });
      expect(none.arrestT, `seed ${seed}`).toBeGreaterThan(min(15));
    }
  });
});
