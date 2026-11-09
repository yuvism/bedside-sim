import { useMemo } from 'react';
import { useSim } from '../../app/store.ts';

/** Event codes that have happened so far (for "already done" styling). */
export function useDoneCodes(): Set<string> {
  const events = useSim((s) => s.view?.events);
  return useMemo(() => new Set((events ?? []).map((e) => e.code)), [events]);
}
