/**
 * Simulated vs reference, one small chart per vital on a shared time axis.
 * Divergent stretches are shaded; replayed actions are dashed lines.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ValidationResult, VitalComparison } from '../../engine/validation/compare.ts';
import { fmtNum, fmtT, niceTicks, timeTicks, VITAL_INFO } from './vitals.ts';

interface Row {
  t: number;
  sim: number | null;
  ref: number | null;
}

const tickStyle = { fill: 'var(--muted)', fontSize: 11 };
/** Plot the sim every few seconds; reference points are always kept. */
const SIM_STEP = 5;

function rowsFor(r: ValidationResult, v: VitalComparison): Row[] {
  const refAt = new Map(v.pairs.map((p) => [p.t, p.ref]));
  const out = new Map<number, Row>();
  for (const s of r.sim) {
    const t = Math.round(s.t);
    if (t < 0) continue;
    if (t % SIM_STEP === 0 || refAt.has(t))
      out.set(t, { t, sim: s[v.vital], ref: refAt.get(t) ?? null });
  }
  for (const p of v.pairs) if (!out.has(p.t)) out.set(p.t, { t: p.t, sim: p.sim, ref: p.ref });
  return [...out.values()].sort((a, b) => a.t - b.t);
}

function Panel({
  r,
  v,
  maxT,
  last,
}: {
  r: ValidationResult;
  v: VitalComparison;
  maxT: number;
  last: boolean;
}) {
  const info = VITAL_INFO[v.vital];
  const rows = useMemo(() => rowsFor(r, v), [r, v]);
  const yTicks = useMemo(() => {
    const vals = rows.flatMap((x) => [x.sim, x.ref]).filter((x): x is number => x !== null);
    return niceTicks(Math.min(info.lo, ...vals), Math.max(info.hi, ...vals));
  }, [rows, info]);
  const m = v.metrics;
  return (
    <figure className="cmp-panel">
      <figcaption>
        <span className="cmp-title">
          {info.title} <span className="muted">({info.unit})</span>
        </span>
        {m.n === 0 ? (
          <span className="muted small">Not observed in the reference</span>
        ) : m.flagged ? (
          <span className="status warn">
            <span aria-hidden="true">⚠</span> Diverges beyond ±{m.tolerance}
          </span>
        ) : (
          <span className="status ok">
            <span aria-hidden="true">✓</span> Within ±{m.tolerance}
          </span>
        )}
      </figcaption>
      <ResponsiveContainer width="100%" height={last ? 150 : 128}>
        <LineChart
          data={rows}
          syncId="validation"
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, maxT]}
            ticks={timeTicks(maxT)}
            tickFormatter={(t: number) => fmtT(t)}
            tick={tickStyle}
            stroke="var(--line)"
            hide={!last}
          />
          <YAxis
            width={40}
            tick={tickStyle}
            stroke="var(--line)"
            allowDecimals={false}
            ticks={yTicks}
            domain={[yTicks[0] ?? 'auto', yTicks[yTicks.length - 1] ?? 'auto']}
          />
          {v.divergences.map((d) => (
            <ReferenceArea
              key={`${d.from}-${d.to}`}
              x1={Math.max(0, d.from - 5)}
              x2={Math.min(maxT, d.to + 5)}
              fill="var(--warn)"
              fillOpacity={0.14}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
          {r.events
            .filter((e) => e.action)
            .map((e, i) => (
              <ReferenceLine
                key={`${e.t}-${i}`}
                x={e.t}
                stroke="var(--muted)"
                strokeDasharray="3 3"
                strokeOpacity={0.6}
              />
            ))}
          <Tooltip
            cursor={{ stroke: 'var(--ink)', strokeOpacity: 0.35 }}
            labelFormatter={(t) => `At ${fmtT(Number(t))}`}
            formatter={(val, name, item) => {
              const label = name === 'sim' ? 'Simulated' : 'Reference';
              const row = item.payload as Row;
              const diff =
                name === 'ref' && row.sim !== null && row.ref !== null
                  ? ` (sim ${row.sim - row.ref >= 0 ? '+' : ''}${fmtNum(row.sim - row.ref)})`
                  : '';
              return [`${fmtNum(Number(val))} ${info.unit}${diff}`, label];
            }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              color: 'var(--ink)',
              fontSize: 13,
            }}
          />
          <Line
            type="monotone"
            dataKey="sim"
            name="sim"
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="linear"
            dataKey="ref"
            name="ref"
            stroke="var(--chart-ref)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--chart-ref)', stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default function ComparisonCharts({ result }: { result: ValidationResult }) {
  const maxT = Math.max(
    1,
    ...result.vitals.flatMap((v) => v.pairs.map((p) => p.t)),
    result.sim.at(-1)?.t ?? 1,
  );
  return (
    <div className="cmp-charts">
      <div className="cmp-legend" aria-hidden="true">
        <span className="key sim">Simulated</span>
        <span className="key ref">Reference (video)</span>
        <span className="key band">Beyond tolerance</span>
        <span className="key event">Replayed action</span>
      </div>
      <div className="cmp-grid">
        {result.vitals.map((v, i) => (
          <Panel key={v.vital} r={result} v={v} maxT={maxT} last={i >= result.vitals.length - 2} />
        ))}
      </div>
    </div>
  );
}
