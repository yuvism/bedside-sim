import { useSim } from '../../app/store.ts';
import { targetAction, type BayTarget } from './bayModel.ts';

/** Open the matching panel, or bring the monitor or ALS panel into view. */
export function activate(target: BayTarget): void {
  const st = useSim.getState();
  const a = targetAction(target, st.view?.status.arrest ?? false);
  if (a.kind === 'tab') {
    st.setPanel(a.tab);
    document.getElementById('actions')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else {
    document.getElementById(a.to)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
