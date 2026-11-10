import { draftCaseId, type Draft } from '../../app/drafts.ts';
import { download } from '../debrief/exportRun.ts';

/** Downloads a draft as pretty-printed case JSON named after its case id. */
export function exportDraft(d: Draft): void {
  download(`${draftCaseId(d)}.json`, `${JSON.stringify(d.data, null, 2)}\n`, 'application/json');
}
