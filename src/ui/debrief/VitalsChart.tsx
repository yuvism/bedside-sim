/**
 * Vitals over time as small multiples (one measure per chart, one shared time
 * axis), with numbered action markers drawn through every panel.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtClock } from '../format.ts';
import type { ChartPoint, Marker } from './chartData.ts';

interface Panel {
  key: 'hr' | 'sbp' | 'spo2' | 'rr';
  title: string;
  unit: string;
  lo: number;
  hi: number;
  /** Alarm threshold drawn as a muted dashed line. */
  limit: number;
  ticks: number[];
}

const PANELS: Panel[] = [
  {
    key: 'hr',
    title: 'Heart rate',
    unit: '/min',
    lo: 50,
    hi: 160,
    limit: 120,
    ticks: [60, 100, 140, 180],
  },
  {
    key: 'sbp',
    title: 'Systolic BP',
    unit: 'mmHg',
    lo: 40,
    hi: 160,
    limit: 90,
    ticks: [60, 90, 120, 150, 180],
  },
  { key: 'spo2', title: 'SpO₂', unit: '%', lo: 80, hi: 100, limit: 92, ticks: [70, 80, 90, 100] },
  {
    key: 'rr',
    title: 'Respiratory rate',
    unit: '/min',
    lo: 0,
    hi: 40,
    limit: 25,
    ticks: [10, 20, 30, 40],
  },
];

const tickStyle = { fill: 'var(--muted)', fontSize: 11 };

interface Props {
  points: ChartPoint[];
  markers: Marker[];
  maxMin: number;
}

export function VitalsChart({ points, markers, maxMin }: Props) {
  return (
    <div className="vitals-chart">
      {PANELS.map((p, i) => {
        const last = i === PANELS.length - 1;
        return (
          <figure key={p.key} className="vc-panel">
            <figcaption>
              {p.title} <span>({p.unit})</span>
            </figcaption>
            <ResponsiveContainer width="100%" height={last ? 128 : 104}>
              <LineChart
                data={points}
                syncId="vitals"
                margin={{ top: 14, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
                <XAxis
                  dataKey="min"
                  type="number"
                  domain={[0, maxMin]}
                  allowDecimals={false}
                  tickFormatter={(m: number) => `${m}`}
                  tick={tickStyle}
                  stroke="var(--line)"
                  hide={!last}
                  label={
                    last
                      ? {
                          value: 'minutes',
                          position: 'insideBottomRight',
                          offset: -2,
                          ...tickStyle,
                        }
                      : undefined
                  }
                />
                <YAxis
                  width={38}
                  tick={tickStyle}
                  stroke="var(--line)"
                  ticks={p.ticks}
                  domain={[
                    (dataMin: number) => Math.min(dataMin, p.lo),
                    (dataMax: number) => Math.max(dataMax, p.hi),
                  ]}
                  allowDecimals={false}
                />
                <ReferenceLine
                  y={p.limit}
                  stroke="var(--muted)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.7}
                />
                {markers.map((m) => (
                  <ReferenceLine
                    key={m.n}
                    x={m.min}
                    stroke={m.harmful ? 'var(--danger)' : 'var(--muted)'}
                    strokeOpacity={0.55}
                    label={
                      i === 0
                        ? { value: String(m.n), position: 'top', fill: 'var(--ink)', fontSize: 11 }
                        : undefined
                    }
                  />
                ))}
                <Tooltip
                  cursor={{ stroke: 'var(--ink)', strokeOpacity: 0.35 }}
                  labelFormatter={(m) => `Minute ${fmtClock(Number(m) * 60)}`}
                  formatter={(v) => [`${v} ${p.unit}`, p.title]}
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
                  dataKey={p.key}
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </figure>
        );
      })}
    </div>
  );
}
