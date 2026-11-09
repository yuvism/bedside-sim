import { useRef, useState, type KeyboardEvent } from 'react';
import { useSim } from '../../app/store.ts';
import { ExamPanel } from './ExamPanel.tsx';
import { InvestigatePanel } from './InvestigatePanel.tsx';
import { TalkPanel } from './TalkPanel.tsx';
import { TreatPanel } from './TreatPanel.tsx';
import './panels.css';

const TABS = [
  { id: 'talk', label: 'Talk' },
  { id: 'exam', label: 'Examine' },
  { id: 'tests', label: 'Investigate' },
  { id: 'treat', label: 'Treat' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ActionPanels() {
  const [tab, setTab] = useState<TabId>('talk');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const unread = useSim((s) => s.view?.unread ?? 0);
  const session = useSim((s) => s.session);
  const phase = useSim((s) => s.phase);
  const diagnosis = useSim((s) => s.diagnosis);
  const setDiagnosis = useSim((s) => s.setDiagnosis);
  const end = useSim((s) => s.end);
  const locked = phase !== 'running';

  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = TABS.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + d + n) % n;
    const t = TABS[next];
    if (t) {
      setTab(t.id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <section className="card actions" aria-label="Actions">
      <div className="tabs" role="tablist" aria-label="Action type">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
            {t.id === 'tests' && unread > 0 && (
              <span className="badge" aria-label={`${unread} unread results`}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        className="panel-host"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'talk' && <TalkPanel locked={locked} />}
        {tab === 'exam' && <ExamPanel locked={locked} />}
        {tab === 'tests' && <InvestigatePanel locked={locked} />}
        {tab === 'treat' && <TreatPanel locked={locked} />}
      </div>
      <div className="wrapup">
        <label>
          Working diagnosis
          <select
            value={diagnosis}
            disabled={locked}
            onChange={(e) => setDiagnosis(e.target.value)}
          >
            <option value="">Not decided yet</option>
            {session?.caseDef.diagnosis.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={locked} onClick={() => end('ended')}>
          End case and review
        </button>
      </div>
    </section>
  );
}
