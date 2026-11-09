/** Export a finished run as JSON or CSV, by clipboard or file download. */
import type { Session } from '../../app/session.ts';
import type { RunExport } from '../../engine/recorder.ts';
import { lastDiagnosis } from '../../engine/scoring.ts';

export function runExport(session: Session, score: number | null): RunExport {
  return session.recorder.toJSON({
    caseId: session.caseDef.id,
    caseVersion: session.caseDef.version,
    seed: session.seed,
    outcome: session.engine.status().outcome ?? 'ended',
    diagnosis: lastDiagnosis(session.events),
    score,
    durationSec: session.t,
  });
}

export function fileStem(session: Session): string {
  return `${session.caseDef.id}-seed${session.seed}`;
}

export function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
