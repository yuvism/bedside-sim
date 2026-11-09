/** Tiny hash router: works on GitHub Pages without server rewrites. */
import { useSyncExternalStore } from 'react';

export type AppRoute = { name: 'home' } | { name: 'case'; caseId: string; seed: number | null };

export function parseHash(hash: string): AppRoute {
  const h = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'case' && parts[1]) {
    const s = new URLSearchParams(query).get('seed');
    const seed = s && /^-?\d{1,9}$/.test(s) ? Number(s) : null;
    return { name: 'case', caseId: decodeURIComponent(parts[1]), seed };
  }
  return { name: 'home' };
}

export const caseHref = (id: string, seed?: number) =>
  `#/case/${encodeURIComponent(id)}${seed !== undefined ? `?seed=${seed}` : ''}`;

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
