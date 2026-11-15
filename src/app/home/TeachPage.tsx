/**
 * "For teachers" in the student app. The teacher tools themselves live in
 * the teacher console, a separate app with its own server; this page says
 * what it does and how to open it.
 */
import { Footer } from '../Footer.tsx';
import { IconArrow, IconCompare, IconEdit, IconPatient, IconVideo } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import './home.css';

/** Set VITE_TEACHER_URL when a teacher console is running (for example http://localhost:8787). */
const TEACHER_URL: string = import.meta.env['VITE_TEACHER_URL'] || '';

const TOOLS = [
  {
    icon: <IconVideo size={26} />,
    title: 'Learn from a video',
    text: 'Open a treatment video and press Autofill with AI: Gemini fills in the monitor readings and the team’s actions. A teacher checks every row, then the case updates itself and proposes what’s missing.',
  },
  {
    icon: <IconEdit size={26} />,
    title: 'Case editor',
    text: 'Build or change a case with forms, check it as you go and test-run it at the bedside.',
  },
  {
    icon: <IconCompare size={26} />,
    title: 'Video validation',
    text: 'Compare the simulation with a timeline annotated from a real treatment video, with error metrics and reports.',
  },
  {
    icon: <IconPatient size={26} />,
    title: 'Publish to students',
    text: 'Approved cases go to this student app. Nothing reaches students until a teacher publishes it.',
  },
];

export function TeachPage() {
  return (
    <>
      <SiteHeader current="teach" />
      <main className="page teach">
        <PageIntro eyebrow="For teachers and researchers" title="The teacher console">
          This site is the student app. Teachers make, check and improve cases in the teacher
          console: a separate app with its own small server, which also handles videos and
          publishing.
        </PageIntro>
        {TEACHER_URL && (
          <p>
            <a className="btn primary big" href={TEACHER_URL}>
              Open the teacher console <IconArrow size={18} />
            </a>
          </p>
        )}
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <div key={t.title} className="card tool">
              <span className="tool-icon">{t.icon}</span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
            </div>
          ))}
        </div>

        <h3 className="section-h">Run the teacher console</h3>
        <ol className="add-steps">
          <li>
            Get the code from <a href="https://github.com/yuvism/bedside-sim">GitHub</a> and run{' '}
            <code>npm install</code>.
          </li>
          <li>
            Optional, for Autofill with AI: get a free key at aistudio.google.com/apikey and put it
            in a <code>.env</code> file as <code>GEMINI_API_KEY=…</code>.
          </li>
          <li>
            Run <code>npm run teacher</code> and open http://localhost:8787.
          </li>
          <li>
            To see published cases here, run this app with <code>VITE_API_URL</code> set to the
            console’s address (see the README).
          </li>
        </ol>
      </main>
      <Footer />
    </>
  );
}
