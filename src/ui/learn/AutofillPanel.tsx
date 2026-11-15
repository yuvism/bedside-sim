/**
 * "Autofill with AI": sends the video (or a public YouTube link) to the
 * teacher server, which asks Gemini for the monitor readings and the team's
 * actions. The rows come back marked for checking; nothing is trusted as is.
 */
import { useEffect, useState } from 'react';
import type { CaseDef } from '../../engine/types.ts';
import {
  autofill,
  getHealth,
  uploadVideo,
  type AutofillReply,
  type Health,
} from '../../teacher/api.ts';

interface Props {
  file: File | null;
  caseDef: CaseDef | undefined;
  /** Rows the teacher already has (they'd be replaced). */
  rowCount: number;
  onFilled(reply: AutofillReply): void;
}

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/;

export function AutofillPanel({ file, caseDef, rowCount, onFilled }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [youtube, setYoutube] = useState('');
  const [consent, setConsent] = useState(false);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'watching'>('idle');
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);

  useEffect(() => {
    getHealth().then(setHealth, (e: unknown) =>
      setHealthError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const youtubeOk = YOUTUBE.test(youtube.trim());
  const source = file ? 'file' : youtubeOk ? 'youtube' : null;
  const ready = health !== null && health.gemini !== 'missing-key';
  const busy = stage !== 'idle';
  const canRun = ready && consent && source !== null && caseDef !== undefined && !busy;

  const run = async () => {
    if (!canRun || !caseDef) return;
    if (rowCount > 0 && !window.confirm(`Replace the ${rowCount} rows you have with the AI’s?`))
      return;
    setNote(null);
    try {
      let videoId: string | undefined;
      if (file) {
        setStage('uploading');
        videoId = (await uploadVideo(file)).id;
      }
      setStage('watching');
      const reply = await autofill({
        videoId,
        youtubeUrl: file ? undefined : youtube.trim(),
        caseJson: caseDef,
        consent,
      });
      onFilled(reply);
      const skipped = reply.unmatched
        ? ` ${reply.unmatched} action${reply.unmatched === 1 ? '' : 's'} didn’t match this case and became notes.`
        : '';
      setNote({
        text: `Filled ${reply.rows.length} rows (${reply.model}). Check each one against the video before analysing.${skipped} ${reply.notes}`,
        warn: false,
      });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), warn: true });
    } finally {
      setStage('idle');
    }
  };

  return (
    <section className="card autofill" aria-labelledby="step-ai">
      <h3 id="step-ai">2. Autofill with AI (optional)</h3>
      <p className="muted small">
        Gemini watches the video and fills the timeline: the monitor every 10 seconds and the team’s
        actions. You check every row before anything is analysed.
      </p>
      {healthError && <p className="hint warn">{healthError}</p>}
      {health?.gemini === 'missing-key' && (
        <p className="hint warn" role="note">
          No Gemini key on the server yet. Get a free key at aistudio.google.com/apikey, put it in
          the project’s <code>.env</code> file as <code>GEMINI_API_KEY=…</code> and restart the
          server.
        </p>
      )}
      {health?.gemini === 'mock' && (
        <p className="hint" role="note">
          Mock mode: autofill returns the bundled AMAX4 rows instead of calling Gemini.
        </p>
      )}
      {health?.gemini === 'ready' && <p className="muted small">Gemini model: {health.model}</p>}

      {file ? (
        <p className="small">
          Video: <strong>{file.name}</strong> ({(file.size / 1e6).toFixed(1)} MB). It’s uploaded
          only when you press Autofill, and deleted from the server and from Gemini straight after.
        </p>
      ) : (
        <label className="yt">
          Or a public YouTube link
          <input
            className="input"
            type="url"
            value={youtube}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setYoutube(e.target.value)}
          />
        </label>
      )}

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          This video is public, or de-identified and approved for AI processing. On Gemini’s free
          tier, Google may use what you send to improve its products.
        </span>
      </label>

      <div className="learn-row">
        <button type="button" className="btn primary" disabled={!canRun} onClick={() => void run()}>
          {stage === 'uploading'
            ? 'Uploading the video…'
            : stage === 'watching'
              ? 'Gemini is watching the video…'
              : 'Autofill with AI'}
        </button>
        {!source && !busy && (
          <span className="muted small">Open a video file above, or paste a YouTube link.</span>
        )}
      </div>
      {busy && (
        <p className="muted small" role="status">
          This can take a minute or two for a long video.
        </p>
      )}
      {note && (
        <p className={note.warn ? 'hint warn' : 'hint'} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}
