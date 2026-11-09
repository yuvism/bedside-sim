import { useRef, useState, type FormEvent } from 'react';
import { DEFAULT_MODEL, type AiSettings } from '../../app/aiSettings.ts';
import { useSim } from '../../app/store.ts';
import './settings.css';

/** Header button that opens the settings dialog (the optional AI patient). */
export function SettingsButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  return (
    <>
      <button className="btn" onClick={show} aria-haspopup="dialog">
        Settings
      </button>
      <dialog
        ref={ref}
        className="settings"
        aria-labelledby="settings-title"
        onClose={() => setOpen(false)}
      >
        {open && <SettingsForm onClose={close} />}
      </dialog>
    </>
  );
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const ai = useSim((s) => s.ai);
  const setAi = useSim((s) => s.setAi);
  const [draft, setDraft] = useState<AiSettings>(ai);
  const [saved, setSaved] = useState<string | null>(null);
  const patch = (p: Partial<AiSettings>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(null);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const next = {
      ...draft,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim() || DEFAULT_MODEL,
    };
    setAi(next);
    setDraft(next);
    setSaved('Saved.');
  };
  const forget = () => {
    const next = { ...draft, apiKey: '', enabled: false };
    setAi(next);
    setDraft(next);
    setSaved('Key removed from this browser.');
  };

  return (
    <form className="dlg settings-form" onSubmit={save}>
      <h2 id="settings-title">Settings</h2>
      <h3>AI patient (optional)</h3>
      <p className="muted small">
        Without a key, typed questions are matched offline to the case’s scripted questions. With
        your own Anthropic API key, Claude answers in character, using only what’s in the case file.
      </p>
      <div className="key-warning" role="note">
        <strong>Your key stays in this browser.</strong> It is saved in this browser’s local storage
        and sent only to the Anthropic API, directly from this page. Anyone who can use this browser
        profile could read it. Use a key with a low spend limit, and select “Forget key” when you’re
        done. Each question is billed to your Anthropic account.
      </div>
      <label className="field" htmlFor="ai-key">
        Anthropic API key
      </label>
      <input
        id="ai-key"
        className="input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-ant-…"
        value={draft.apiKey}
        onChange={(e) => patch({ apiKey: e.target.value })}
      />
      <label className="field" htmlFor="ai-model">
        Model
      </label>
      <input
        id="ai-model"
        className="input"
        spellCheck={false}
        value={draft.model}
        onChange={(e) => patch({ model: e.target.value })}
      />
      <p className="hint">
        Default {DEFAULT_MODEL}. A smaller model such as claude-haiku-5-5 is faster and cheaper.
      </p>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Use Claude for typed questions
      </label>
      {draft.enabled && !draft.apiKey.trim() && (
        <p className="hint warn">
          Add a key to use Claude. Until then the offline matcher answers.
        </p>
      )}
      <div className="settings-actions">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={forget}
          disabled={!ai.apiKey && !draft.apiKey}
        >
          Forget key
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <span className="hint" role="status">
          {saved}
        </span>
      </div>
    </form>
  );
}
