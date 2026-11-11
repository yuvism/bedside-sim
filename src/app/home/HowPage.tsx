/** How a case works: the steps, the two ways to practise, modes and shortcuts. */
import { Footer } from '../Footer.tsx';
import { IconBook, IconChart, IconChat, IconPatient, IconPulse } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import './home.css';

const STEPS = [
  {
    icon: <IconBook />,
    title: 'Read the brief',
    text: 'Who the patient is and why you’re there. Choose guided mode (with prompts) or exam mode.',
  },
  {
    icon: <IconPulse />,
    title: 'Assess as you would',
    text: 'Work through ABCDE, examine head to toe, ask questions in your own words and watch the live monitor.',
  },
  {
    icon: <IconChat />,
    title: 'Treat and lead the team',
    text: 'Order drugs, fluids, oxygen and tests. The nurse reads back, carries them out and questions unsafe orders.',
  },
  {
    icon: <IconChart />,
    title: 'Learn from the debrief',
    text: 'Your score, what you missed, the vitals timeline and teaching points. Replay from any minute.',
  },
];

export function HowPage() {
  return (
    <>
      <SiteHeader current="how" />
      <main className="page how">
        <PageIntro eyebrow="How it works" title="A case, from arrival to debrief">
          Each case is a patient whose physiology runs second by second. Delays and wrong turns have
          consequences, as they would on the ward.
        </PageIntro>

        <ol className="how-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card how-step">
              <span className="how-n">{i + 1}</span>
              <span className="feature-icon">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>

        <h3 className="section-h">Two ways to practise</h3>
        <div className="two-up">
          <a className="card how-way" href="#/topics">
            <span className="feature-icon">
              <IconBook />
            </span>
            <h4>Learn by topic</h4>
            <p>
              Pick a condition and practise managing it. Good for revising one topic or before a
              teaching session.
            </p>
          </a>
          <a className="card how-way blind" href="#/patients">
            <span className="feature-icon">
              <IconPatient />
            </span>
            <h4>Unknown patient</h4>
            <p>
              Pick a patient by their presenting complaint and work out the diagnosis yourself. Good
              for exam practice and for clinical reasoning.
            </p>
          </a>
        </div>

        <h3 className="section-h">Guided or exam mode</h3>
        <div className="two-up">
          <div className="card how-way">
            <h4>Guided</h4>
            <p>
              The nurse prompts you when you stall, teaching notes appear as you go, and a trend
              chip shows whether the patient is improving.
            </p>
          </div>
          <div className="card how-way">
            <h4>Exam</h4>
            <p>No prompts or hints, and an OSCE-style breakdown with a pass mark at the end.</p>
          </div>
        </div>

        <h3 className="section-h">Keyboard shortcuts at the bedside</h3>
        <p className="kbd-row">
          <span>
            <kbd>Space</kbd> pause or resume
          </span>
          <span>
            <kbd>1</kbd> Talk
          </span>
          <span>
            <kbd>2</kbd> Examine
          </span>
          <span>
            <kbd>3</kbd> Investigate
          </span>
          <span>
            <kbd>4</kbd> Treat
          </span>
        </p>

        <p className="callout" role="note">
          <strong>Educational simulation. Simplified physiology. Not clinical guidance.</strong> The
          numbers come from published guidelines where they exist; values still awaiting clinical
          review are listed openly on GitHub.
        </p>
      </main>
      <Footer />
    </>
  );
}
