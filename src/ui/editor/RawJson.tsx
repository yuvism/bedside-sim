import { useState } from 'react';

/** The whole case as JSON text, for pasting or bulk edits. Applied on demand. */
export function RawJson({ value, onApply }: { value: unknown; onApply(v: unknown): void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const apply = () => {
    try {
      onApply(JSON.parse(text) as unknown);
      setError(null);
      setApplied(true);
    } catch (e) {
      setError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <div className="raw-json">
      <p className="muted small">
        Edit or paste the whole case here, then apply. The form sections update from it.
      </p>
      <textarea
        className="input raw-text"
        value={text}
        spellCheck={false}
        aria-label="Case JSON"
        onChange={(e) => {
          setText(e.target.value);
          setApplied(false);
        }}
      />
      <div className="raw-actions">
        <button type="button" className="btn primary" onClick={apply}>
          Apply JSON
        </button>
        <span className="hint" role="status">
          {applied ? 'Applied.' : ''}
        </span>
      </div>
      {error && (
        <p className="hint warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
