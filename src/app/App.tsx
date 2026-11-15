import { useEffect } from 'react';
import { getCase } from '../content/cases.ts';
import { Bedside } from './Bedside.tsx';
import { bayOf, caseByCode } from './caseMeta.ts';
import { HowPage } from './home/HowPage.tsx';
import { Home } from './home/Home.tsx';
import { PatientsPage } from './home/PatientsPage.tsx';
import { TeachPage } from './home/TeachPage.tsx';
import { TopicsPage } from './home/TopicsPage.tsx';
import { caseHref, patientHref, useRoute } from './router.ts';

/**
 * The student app: welcome, cases by topic, unknown patients, the bedside
 * and the debrief. Teacher tools live in the teacher console (src/teacher,
 * served by server/), so their routes simply land on the welcome screen here.
 */
export function App() {
  const route = useRoute();
  const needsSeed = (route.name === 'case' || route.name === 'patient') && route.seed === null;

  // A case URL without a seed gets a random one, so every run can be replayed from its URL.
  useEffect(() => {
    if (!needsSeed) return;
    const fresh = Math.floor(Math.random() * 1_000_000);
    const href =
      route.name === 'case'
        ? caseHref(route.caseId, fresh)
        : route.name === 'patient'
          ? patientHref(route.code, fresh)
          : null;
    if (!href) return;
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [needsSeed, route]);

  switch (route.name) {
    case 'topics':
      return <TopicsPage />;
    case 'patients':
      return <PatientsPage />;
    case 'how':
      return <HowPage />;
    case 'teach':
      return <TeachPage />;
    case 'case': {
      const caseDef = getCase(route.caseId);
      if (caseDef && route.seed !== null) {
        return (
          <Bedside
            key={`${caseDef.id}:${route.seed}`}
            caseDef={caseDef}
            seed={route.seed}
            bay={bayOf(caseDef.id)}
          />
        );
      }
      if (caseDef) return null;
      return <TopicsPage />;
    }
    case 'patient': {
      const caseDef = caseByCode(route.code);
      if (caseDef && route.seed !== null) {
        return (
          <Bedside
            key={`${caseDef.id}:${route.seed}`}
            caseDef={caseDef}
            seed={route.seed}
            bay={bayOf(caseDef.id)}
            blind
          />
        );
      }
      if (caseDef) return null;
      return <PatientsPage />;
    }
    default:
      return <Home />;
  }
}
