/** Display helpers shared across the UI. */

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtInt(v: number | null | undefined, empty = '--'): string {
  return v === null || v === undefined || Number.isNaN(v) ? empty : String(Math.round(v));
}

export function fmtDuration(min: number): string {
  if (min < 1) return 'instant';
  if (min < 60) return `about ${Math.round(min)} min`;
  const h = min / 60;
  return `about ${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export const kpaToMmHg = (kpa: number) => kpa * 7.50062;
