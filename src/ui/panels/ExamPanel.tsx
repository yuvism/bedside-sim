import { useSim } from '../../app/store.ts';
import { BodyMap } from './BodyMap.tsx';
import { useDoneCodes } from './useDoneCodes.ts';

export function ExamPanel({ locked }: { locked: boolean }) {
  const session = useSim((s) => s.session);
  const act = useSim((s) => s.act);
  const done = useDoneCodes();
  const exam = session?.caseDef.exam ?? [];
  const abcde = exam.filter((e) => e.kind === 'abcde');
  const regions = exam.filter((e) => e.kind === 'region');
  const run = (examId: string) => act({ kind: 'exam', examId });
  const isDone = (id: string) => done.has(`exam:${id}`);

  return (
    <div className="panel-stack">
      <section className="group" aria-labelledby="exam-abcde">
        <h3 id="exam-abcde">ABCDE assessment</h3>
        <p className="hint">Work through it in order.</p>
        <div className="grid">
          {abcde.map((e) => (
            <button
              key={e.id}
              className={`act${isDone(e.id) ? ' is-done' : ''}`}
              disabled={locked}
              onClick={() => run(e.id)}
            >
              <span className="step" aria-hidden="true">
                {e.id}
              </span>
              {e.label}
            </button>
          ))}
        </div>
      </section>
      {regions.length > 0 && (
        <section className="group" aria-labelledby="exam-regions">
          <h3 id="exam-regions">Head to toe</h3>
          <div className="body-exam">
            <BodyMap
              regions={regions.map((r) => ({ id: r.id, region: r.region ?? r.id, label: r.label }))}
              done={new Set(regions.filter((r) => isDone(r.id)).map((r) => r.region ?? r.id))}
              disabled={locked}
              onPick={run}
            />
            <div className="grid narrow">
              {regions.map((e) => (
                <button
                  key={e.id}
                  className={`act${isDone(e.id) ? ' is-done' : ''}`}
                  disabled={locked}
                  onClick={() => run(e.id)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
