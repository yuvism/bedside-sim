/**
 * The teacher console (backend prototype): dashboard, Learn from a video,
 * case editor, validation and published cases. Served by the teacher server
 * (server/), which does the uploads, Gemini autofill, fitting and publishing.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Bedside } from '../app/Bedside.tsx';
import { getDraft } from '../app/drafts.ts';
import { Footer } from '../app/Footer.tsx';
import { editorHref, testHref, useRoute } from '../app/router.ts';
import { checkCase } from '../content/library.ts';
import { Dashboard } from './Dashboard.tsx';
import { PublishedPage } from './PublishedPage.tsx';
import { TeacherHeader } from './TeacherHeader.tsx';

const EditorHome = lazy(() => import('../ui/editor/EditorHome.tsx'));
const CaseEditor = lazy(() => import('../ui/editor/CaseEditor.tsx'));
const ValidationPage = lazy(() => import('../ui/validation/ValidationPage.tsx'));
const LearnPage = lazy(() => import('../ui/learn/LearnPage.tsx'));

const loading = <p className="page hint">Loading…</p>;

function DraftProblem({ draftId, problem }: { draftId: string; problem: string }) {
  return (
    <>
      <TeacherHeader current="editor" />
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

export function TeacherApp() {
  const route = useRoute();
  const needsSeed = route.name === 'test' && route.seed === null;

  // A test-run URL without a seed gets a random one, so the run can be replayed.
  useEffect(() => {
    if (!needsSeed || route.name !== 'test') return;
    window.history.replaceState(null, '', testHref(route.draftId, Math.floor(Math.random() * 1e6)));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [needsSeed, route]);

  switch (route.name) {
    case 'learn':
      return (
        <Suspense fallback={loading}>
          <LearnPage />
        </Suspense>
      );
    case 'validate':
      return (
        <Suspense fallback={loading}>
          <ValidationPage />
        </Suspense>
      );
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
    case 'published':
      return <PublishedPage />;
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
    default:
      return <Dashboard />;
  }
}
