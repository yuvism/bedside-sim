/** "Publish to students": sends a valid case to the teacher server, which validates it again. */
import { useState } from 'react';
import { publishCase } from './api.ts';

export function PublishButton({ data, disabled }: { data: unknown; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);

  const publish = async () => {
    const title = (data as { title?: unknown }).title;
    const name = typeof title === 'string' ? `“${title}”` : 'this case';
    if (!window.confirm(`Publish ${name} to students? It appears in the student app.`)) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await publishCase(data);
      setNote({
        text: r.replaces
          ? `Published. It replaces the built-in case ${r.id} for students.`
          : `Published as ${r.id}. Students see it next time they open the app.`,
        warn: false,
      });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={disabled || busy}
        title={disabled ? 'Fix the problems first' : 'Make this case available to students'}
        onClick={() => void publish()}
      >
        {busy ? 'Publishing…' : 'Publish to students'}
      </button>
      {note && (
        <span className={note.warn ? 'hint warn publish-note' : 'hint publish-note'} role="status">
          {note.text}
        </span>
      )}
    </>
  );
}
