/** Tiny hash router: works on GitHub Pages without server rewrites. */
import { useSyncExternalStore } from 'react';

export type AppRoute =
  | { name: 'home' }
  | { name: 'topics' }
  | { name: 'patients' }
  | { name: 'how' }
  | { name: 'teach' }
  | { name: 'case'; caseId: string; seed: number | null }
  /** An "unknown patient": the case is named by an opaque code, not its id. */
  | { name: 'patient'; code: string; seed: number | null }
  | { name: 'editor' }
  | { name: 'edit'; draftId: string }
  | { name: 'test'; draftId: string; seed: number | null }
  | { name: 'validate' }
  | { name: 'learn' };

function seedOf(query: string): number | null {
  const s = new URLSearchParams(query).get('seed');
  return s && /^-?\d{1,9}$/.test(s) ? Number(s) : null;
}

export function parseHash(hash: string): AppRoute {
  const h = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'case' && parts[1]) {
    return { name: 'case', caseId: decodeURIComponent(parts[1]), seed: seedOf(query) };
  }
  if (parts[0] === 'patient' && parts[1]) {
    return { name: 'patient', code: decodeURIComponent(parts[1]), seed: seedOf(query) };
  }
  if (parts[0] === 'topics') return { name: 'topics' };
  if (parts[0] === 'patients') return { name: 'patients' };
  if (parts[0] === 'how') return { name: 'how' };
  if (parts[0] === 'teach') return { name: 'teach' };
  if (parts[0] === 'editor') {
    return parts[1] ? { name: 'edit', draftId: decodeURIComponent(parts[1]) } : { name: 'editor' };
  }
  if (parts[0] === 'validate') return { name: 'validate' };
  if (parts[0] === 'learn') return { name: 'learn' };
  if (parts[0] === 'test' && parts[1]) {
    return { name: 'test', draftId: decodeURIComponent(parts[1]), seed: seedOf(query) };
  }
  return { name: 'home' };
}

export const caseHref = (id: string, seed?: number) =>
  `#/case/${encodeURIComponent(id)}${seed !== undefined ? `?seed=${seed}` : ''}`;

export const patientHref = (code: string, seed?: number) =>
  `#/patient/${encodeURIComponent(code)}${seed !== undefined ? `?seed=${seed}` : ''}`;

export const editorHref = (draftId?: string) =>
  draftId ? `#/editor/${encodeURIComponent(draftId)}` : '#/editor';

export const testHref = (draftId: string, seed?: number) =>
  `#/test/${encodeURIComponent(draftId)}${seed !== undefined ? `?seed=${seed}` : ''}`;

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
