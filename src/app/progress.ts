/**
 * Local progress history: attempts and best score per case, kept in this
 * browser only (localStorage, with an in-memory fallback when unavailable).
 */
export interface CaseProgress {
  attempts: number;
  best: number;
  last: number;
  lastOutcome: string;
  lastAt: string;
}

const KEY = 'bedside-sim:progress';
let memory: Record<string, CaseProgress> = {};

const storage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage);

function load(): Record<string, CaseProgress> {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, CaseProgress>;
  } catch {
    /* fall through to memory */
  }
  return memory;
}

function save(all: Record<string, CaseProgress>): void {
  memory = all;
  try {
    storage()?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: memory copy still works this session */
  }
}

export function getProgress(caseId: string): CaseProgress | null {
  return load()[caseId] ?? null;
}

export function recordAttempt(caseId: string, percent: number, outcome: string): CaseProgress {
  const all = load();
  const prev = all[caseId];
  const next: CaseProgress = {
    attempts: (prev?.attempts ?? 0) + 1,
    best: Math.max(prev?.best ?? 0, percent),
    last: percent,
    lastOutcome: outcome,
    lastAt: new Date().toISOString(),
  };
  save({ ...all, [caseId]: next });
  return next;
}

export function clearProgress(): void {
  save({});
}
