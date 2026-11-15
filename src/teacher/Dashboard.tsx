/** Teacher console home: server and Gemini status, the tools, and the video-to-students steps. */
import { useEffect, useState } from 'react';
import { Footer } from '../app/Footer.tsx';
import { IconArrow, IconCompare, IconEdit, IconPatient, IconVideo } from '../app/home/icons.tsx';
import { PageIntro } from '../app/home/SiteHeader.tsx';
import { getHealth, listPublished, type Health } from './api.ts';
import { TeacherHeader } from './TeacherHeader.tsx';
import './teacher.css';

const TOOLS = [
  {
    href: '#/learn',
    icon: <IconVideo size={26} />,
    title: 'Learn from a video',
    text: 'Open a treatment video, press Autofill with AI, check the rows, and let the server update the case and propose what’s missing.',
  },
  {
    href: '#/editor',
    icon: <IconEdit size={26} />,
    title: 'Case editor',
    text: 'Review drafts with forms, test-run them at the bedside, and publish them to students.',
  },
  {
    href: '#/validate',
    icon: <IconCompare size={26} />,
    title: 'Video validation',
    text: 'Compare the simulation with an annotated video timeline, with error metrics and reports.',
  },
  {
    href: '#/published',
    icon: <IconPatient size={26} />,
    title: 'Published to students',
    text: 'See which cases students get from this console, and unpublish any of them.',
  },
];

function Status({
  health,
  error,
  published,
}: {
  health: Health | null;
  error: string | null;
  published: number | null;
}) {
  if (error) return <p className="hint warn">{error}</p>;
  if (!health) return <p className="muted small">Checking the server…</p>;
  const gemini =
    health.gemini === 'ready'
      ? { cls: 'ok', text: `Gemini ready (${health.model})` }
      : health.gemini === 'mock'
        ? { cls: 'ok', text: 'Gemini: mock mode' }
        : { cls: 'warn', text: 'Gemini: add GEMINI_API_KEY to .env' };
  return (
    <ul className="console-status" aria-label="Server status">
      <li className="status-pill ok">Server running</li>
      <li className={`status-pill ${gemini.cls}`}>{gemini.text}</li>
      {published !== null && (
        <li className="status-pill">
          {published} published case{published === 1 ? '' : 's'}
        </li>
      )}
    </ul>
  );
}

export function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<number | null>(null);

  useEffect(() => {
    getHealth().then(setHealth, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
    listPublished().then(
      (l) => setPublished(l.length),
      () => undefined,
    );
  }, []);

  return (
    <>
      <TeacherHeader current="home" />
      <main className="page teach">
        <PageIntro
          eyebrow="Teacher console · backend prototype"
          title="Make, check and improve cases"
        >
          This console runs on a small server on your computer. It turns treatment videos into case
          updates with <strong>Autofill with AI</strong> (Google Gemini), runs the fitting, and
          publishes approved cases to the student app.
        </PageIntro>
        <Status health={health} error={error} published={published} />
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <a key={t.href} className="card tool" href={t.href}>
              <span className="tool-icon">{t.icon}</span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <span className="tool-go" aria-hidden="true">
                Open <IconArrow size={16} />
              </span>
            </a>
          ))}
        </div>

        <h3 className="section-h">From a video to students</h3>
        <ol className="add-steps">
          <li>
            Open the video in <a href="#/learn">Learn from a video</a> and pick the closest case.
          </li>
          <li>
            Press <strong>Autofill with AI</strong>: Gemini fills in the monitor readings and the
            team’s actions.
          </li>
          <li>Check every row against the video. Fix or remove anything wrong.</li>
          <li>Analyse: the server fits the case to the video and lists what’s missing.</li>
          <li>Create a draft, review it in the case editor and test-run it at the bedside.</li>
          <li>
            Press <strong>Publish to students</strong>. It appears in the student app.
          </li>
        </ol>
      </main>
      <Footer />
    </>
  );
}
