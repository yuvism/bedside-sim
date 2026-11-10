/**
 * Case-editor drafts, kept only in this browser's localStorage. A draft holds
 * raw case JSON, which may be invalid while it's being written.
 */

export interface Draft {
  /** Draft id (not the case id, which lives in data.id). */
  id: string;
  updated: number;
  data: unknown;
}

export const DRAFTS_KEY = 'bedside-sim:drafts';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readAll(): Draft[] {
  try {
    const raw = storage()?.getItem(DRAFTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (d): d is Draft => typeof d === 'object' && d !== null && typeof (d as Draft).id === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(list: readonly Draft[]): string | null {
  const store = storage();
  if (!store) return 'This browser isn’t letting the page save drafts.';
  try {
    store.setItem(DRAFTS_KEY, JSON.stringify(list));
    return null;
  } catch {
    return 'Couldn’t save: browser storage is full. Export and delete some drafts.';
  }
}

/** Newest first. */
export function listDrafts(): Draft[] {
  return readAll().sort((a, b) => b.updated - a.updated);
}

export function getDraft(id: string): Draft | undefined {
  return readAll().find((d) => d.id === id);
}

/** Saves (or replaces) a draft. Returns an error message, or null. */
export function saveDraft(d: Draft): string | null {
  const rest = readAll().filter((x) => x.id !== d.id);
  return writeAll([...rest, d]);
}

export function deleteDraft(id: string): string | null {
  return writeAll(readAll().filter((x) => x.id !== id));
}

export function newDraftId(): string {
  return `d${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

export function newDraft(data: unknown, now = Date.now()): Draft {
  return { id: newDraftId(), updated: now, data: structuredClone(data) };
}

/** A copy of an existing case under a new id, so it never clashes with the original. */
export function copyOfCase(data: unknown): unknown {
  const c = structuredClone(data) as Record<string, unknown>;
  if (typeof c['id'] === 'string') c['id'] = `${c['id']}-copy`;
  if (typeof c['title'] === 'string') c['title'] = `${c['title']} (copy)`;
  return c;
}

export function draftTitle(d: Draft): string {
  const t = (d.data as { title?: unknown } | null)?.title;
  return typeof t === 'string' && t.trim() ? t : 'Untitled case';
}

export function draftCaseId(d: Draft): string {
  const id = (d.data as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : 'case';
}
