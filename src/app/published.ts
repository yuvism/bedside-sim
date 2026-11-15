/**
 * Cases teachers published from the teacher console. When the student app is
 * built with VITE_API_URL, it asks that server for them once at start-up and
 * adds the valid ones to the case list. Any failure just leaves the built-in
 * cases, so the app never waits more than a moment for an absent server.
 */
import { addPublished } from '../content/cases.ts';

export async function loadPublished(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/api/published`, {
      signal: ctrl.signal,
    });
    if (!r.ok) return 0;
    const list: unknown = await r.json();
    return Array.isArray(list) ? addPublished(list).added.length : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
