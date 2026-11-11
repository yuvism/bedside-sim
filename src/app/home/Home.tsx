/**
 * The welcome screen: one decision, how to practise. Everything else lives
 * on its own page (topics, patients, how it works, for teachers).
 */
import { CASES } from '../../content/library.ts';
import { surpriseHref } from '../caseMeta.ts';
import { Footer } from '../Footer.tsx';
import {
  IconArrow,
  IconBook,
  IconChart,
  IconChat,
  IconCode,
  IconPatient,
  IconPulse,
} from './icons.tsx';
import { SiteHeader } from './SiteHeader.tsx';
import './home.css';

const BEAT: [number, number][] = [
  [0, 0],
  [26, 0],
  [32, -4],
  [38, 0],
  [52, 0],
  [57, 6],
  [62, -38],
  [67, 14],
  [72, 0],
  [94, 0],
  [103, -8],
  [114, 0],
  [140, 0],
];

/** A long ECG trace for the stage background, `beats` beats wide. */
function ecgPoints(beats: number, base: number): string {
  const pts: string[] = [];
  for (let b = 0; b < beats; b++) {
    for (const [x, y] of BEAT) pts.push(`${b * 140 + x},${base + y}`);
  }
  return pts.join(' ');
}

const TRACE = ecgPoints(12, 60);

const MONITOR =
  '0,55 30,55 38,50 44,55 60,55 66,62 72,10 78,72 84,55 110,55 120,46 132,55 160,55 168,50 174,55 190,55 196,62 202,10 208,72 214,55 240,55 250,46 262,55 290,55 298,50 304,55 320,55';

function HeroMonitor() {
  return (
    <div className="hero-monitor" aria-hidden="true">
      <div className="hm-head">
        <span>Bay 3 · Monitor</span>
        <span className="hm-alarm">SBP LOW</span>
      </div>
      <svg viewBox="0 0 320 90" preserveAspectRatio="none">
        <polyline className="hero-ecg" points={MONITOR} />
        <polyline className="hero-ecg sweep" points={MONITOR} />
      </svg>
      <div className="hero-nums">
        <span className="hn hr">
          HR <b>118</b>
        </span>
        <span className="hn spo2">
          SpO₂ <b>94</b>
        </span>
        <span className="hn bp">
          NIBP <b>87/51</b>
        </span>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <IconPulse />,
    title: 'Live physiology',
    text: 'Vital signs change every second with what you do, and what you don’t.',
  },
  {
    icon: <IconChat />,
    title: 'A nurse who talks back',
    text: 'Orders are read back, carried out with real delays, and unsafe ones questioned.',
  },
  {
    icon: <IconChart />,
    title: 'A debrief that teaches',
    text: 'Your score, what you missed, the vitals timeline and teaching points.',
  },
  {
    icon: <IconCode />,
    title: 'Free and open source',
    text: 'Runs in any browser on a laptop or phone. Nothing to install.',
  },
];

export function Home() {
  const specialties = new Set(CASES.map((c) => c.specialty)).size;
  return (
    <>
      <SiteHeader current="home" />
      <main className="home">
        <section className="stage" aria-labelledby="home-h">
          <svg
            className="stage-trace"
            viewBox="0 0 1680 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={TRACE} pathLength={1000} />
            <polyline className="sweep" points={TRACE} pathLength={1000} />
          </svg>
          <div className="stage-inner">
            <div className="stage-top">
              <div className="stage-copy">
                <p className="eyebrow">Virtual patients for medical students</p>
                <h2 id="home-h">Practise acute care on patients who respond to every decision</h2>
                <p className="stage-sub">
                  Assess, talk to and treat a patient whose vital signs change second by second.
                  Then see your score, what you missed and why.
                </p>
              </div>
              <HeroMonitor />
            </div>

            <h3 className="choose-h">How do you want to practise?</h3>
            <div className="choices">
              <a className="choice" href="#/topics">
                <span className="choice-icon">
                  <IconBook size={28} />
                </span>
                <span className="choice-body">
                  <span className="choice-tag">Revise a condition</span>
                  <span className="choice-title">Learn by topic</span>
                  <span className="choice-text">
                    Choose a condition, such as anaphylaxis, asthma or sepsis, and practise managing
                    it from start to finish.
                  </span>
                  <span className="choice-meta">
                    {CASES.length} conditions · {specialties} specialties
                  </span>
                </span>
                <span className="choice-go">
                  <IconArrow />
                </span>
              </a>
              <a className="choice blind" href="#/patients">
                <span className="choice-icon">
                  <IconPatient size={28} />
                </span>
                <span className="choice-body">
                  <span className="choice-tag">Like a real shift</span>
                  <span className="choice-title">Unknown patient</span>
                  <span className="choice-text">
                    Pick a patient by what they came in with. Work out what’s wrong yourself, then
                    treat them. The diagnosis stays hidden until the debrief.
                  </span>
                  <span className="choice-meta">{CASES.length} patients waiting</span>
                </span>
                <span className="choice-go">
                  <IconArrow />
                </span>
              </a>
            </div>
            <p className="surprise-line">
              Not sure?{' '}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  window.location.hash = surpriseHref();
                }}
              >
                See a random patient
              </button>
            </p>
          </div>
        </section>

        <section className="features" aria-label="What’s inside">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon">{f.icon}</span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
