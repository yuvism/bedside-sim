import { lazy, Suspense, useEffect } from 'react';
import { checkCase, getCase } from '../content/library.ts';
import { Bedside } from './Bedside.tsx';
import { CaseList } from './CaseList.tsx';
import { getDraft } from './drafts.ts';
import { Footer } from './Footer.tsx';
import { caseHref, editorHref, testHref, useRoute } from './router.ts';

const EditorHome = lazy(() => import('../ui/editor/EditorHome.tsx'));
const CaseEditor = lazy(() => import('../ui/editor/CaseEditor.tsx'));

const loading = <p className="page hint">Loading the case editor…</p>;

function DraftProblem({ draftId, problem }: { draftId: string; problem: string }) {
  return (
    <>
      <main className="page">
        <h2 className="page-title">Can’t test-run this draft</h2>
        <p>{problem}</p>
        <p>
          <a className="btn primary" href={editorHref(getDraft(draftId) ? draftId : undefined)}>
            Back to the editor
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}

export function App() {
  const route = useRoute();
  const needsSeed = (route.name === 'case' || route.name === 'test') && route.seed === null;

  // A case URL without a seed gets a random one, so every run can be replayed from its URL.
  useEffect(() => {
    if (!needsSeed) return;
    const fresh = Math.floor(Math.random() * 1_000_000);
    const href =
      route.name === 'case'
        ? caseHref(route.caseId, fresh)
        : route.name === 'test'
          ? testHref(route.draftId, fresh)
          : null;
    if (!href) return;
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [needsSeed, route]);

  switch (route.name) {
    case 'editor':
      return (
        <Suspense fallback={loading}>
          <EditorHome />
        </Suspense>
      );
    case 'edit':
      return (
        <Suspense fallback={loading}>
          <CaseEditor key={route.draftId} draftId={route.draftId} />
        </Suspense>
      );
    case 'test': {
      if (route.seed === null) return null;
      const draft = getDraft(route.draftId);
      if (!draft)
        return <DraftProblem draftId={route.draftId} problem="That draft no longer exists." />;
      const r = checkCase(draft.data);
      if (!r.ok) {
        return (
          <DraftProblem
            draftId={route.draftId}
            problem={`It has ${r.issues.length} problem${r.issues.length === 1 ? '' : 's'}. Fix them in the editor first.`}
          />
        );
      }
      return (
        <Bedside
          key={`${route.draftId}:${draft.updated}:${route.seed}`}
          caseDef={r.value}
          seed={route.seed}
          draftId={route.draftId}
        />
      );
    }
    case 'case': {
      const caseDef = getCase(route.caseId);
      if (caseDef && route.seed !== null) {
        return <Bedside key={`${caseDef.id}:${route.seed}`} caseDef={caseDef} seed={route.seed} />;
      }
      if (caseDef) return null;
      return <CaseList />;
    }
    default:
      return <CaseList />;
  }
}
