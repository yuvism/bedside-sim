/** Tools for teachers and researchers: the case editor, video validation and learning from a video. */
import { Footer } from '../Footer.tsx';
import { IconArrow, IconCompare, IconEdit, IconVideo } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import './home.css';

const TOOLS = [
  {
    href: '#/editor',
    icon: <IconEdit size={26} />,
    title: 'Case editor',
    text: 'Build a new case or change one with forms, check it as you go, then test-run it at the bedside.',
  },
  {
    href: '#/validate',
    icon: <IconCompare size={26} />,
    title: 'Video validation',
    text: 'Compare the simulation with a timeline annotated from a real treatment video, with error metrics and reports.',
  },
  {
    href: '#/learn',
    icon: <IconVideo size={26} />,
    title: 'Learn from a video',
    text: 'Let a case update itself from a treatment video and propose what’s missing. Every change goes to a draft for review.',
  },
];

export function TeachPage() {
  return (
    <>
      <SiteHeader current="teach" />
      <main className="page teach">
        <PageIntro eyebrow="For teachers and researchers" title="Make, check and improve cases">
          Cases are plain JSON with a source for every medical number. Nothing here needs code or a
          server, and nothing leaves your browser unless you export it.
        </PageIntro>
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

        <h3 className="section-h">Add a case to the library</h3>
        <ol className="add-steps">
          <li>
            Open the <a href="#/editor">case editor</a>. Start a new case or duplicate one.
          </li>
          <li>Fill in each section. Problems show next to their fields.</li>
          <li>Test-run it at the bedside until it behaves the way you want.</li>
          <li>
            Export the JSON and open a pull request on{' '}
            <a href="https://github.com/yuvism/bedside-sim">GitHub</a>. A clinician reviews it
            before it goes live.
          </li>
        </ol>
      </main>
      <Footer />
    </>
  );
}
