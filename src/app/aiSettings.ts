/**
 * Settings for the optional AI patient. The API key lives only in this
 * browser's localStorage: it is never bundled, committed or sent anywhere
 * except directly to the Anthropic API.
 */
export interface AiSettings {
  /** Use Claude for free-text questions when a key is present. */
  enabled: boolean;
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const AI_KEY = 'bedside-sim:ai';

export const DEFAULT_AI: AiSettings = { enabled: false, apiKey: '', model: DEFAULT_MODEL };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = storage()?.getItem(AI_KEY);
    if (!raw) return { ...DEFAULT_AI };
    const v = JSON.parse(raw) as Partial<AiSettings>;
    return {
      enabled: v.enabled === true,
      apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
      model: typeof v.model === 'string' && v.model.trim() ? v.model.trim() : DEFAULT_MODEL,
    };
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAiSettings(s: AiSettings): void {
  try {
    const store = storage();
    if (!store) return;
    // Nothing worth keeping: leave no trace in storage.
    if (!s.apiKey && !s.enabled && s.model === DEFAULT_MODEL) store.removeItem(AI_KEY);
    else store.setItem(AI_KEY, JSON.stringify({ ...s, model: s.model.trim() || DEFAULT_MODEL }));
  } catch {
    /* storage unavailable: settings last for this page only */
  }
}

/** True when free-text questions should go to Claude. */
export const aiReady = (s: AiSettings): boolean => s.enabled && s.apiKey.trim().length > 0;
