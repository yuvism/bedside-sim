import { useEffect } from 'react';
import { getCase } from '../content/library.ts';
import { Bedside } from './Bedside.tsx';
import { CaseList } from './CaseList.tsx';
import { caseHref, useRoute } from './router.ts';

export function App() {
  const route = useRoute();
  const caseId = route.name === 'case' ? route.caseId : null;
  const seed = route.name === 'case' ? route.seed : null;

  // A case URL without a seed gets a random one, so every run can be replayed from its URL.
  useEffect(() => {
    if (caseId && seed === null) {
      const fresh = Math.floor(Math.random() * 1_000_000);
      window.history.replaceState(null, '', caseHref(caseId, fresh));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, [caseId, seed]);

  const caseDef = caseId ? getCase(caseId) : undefined;
  if (caseDef && seed !== null) {
    return <Bedside key={`${caseDef.id}:${seed}`} caseDef={caseDef} seed={seed} />;
  }
  if (caseDef) return null;
  return <CaseList />;
}
