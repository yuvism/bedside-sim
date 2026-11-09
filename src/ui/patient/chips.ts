import { LIBRARY } from '../../content/library.ts';
import type { EngineStatus } from '../../engine/engine.ts';
import { fmtClock } from '../format.ts';

const label = (list: { id: string; label?: string; name?: string }[], id: string) => {
  const x = list.find((i) => i.id === id);
  return x?.label ?? x?.name ?? id;
};

export function statusChips(st: EngineStatus): { text: string; on: boolean }[] {
  const chips: { text: string; on: boolean }[] = [];
  if (st.access.iv) chips.push({ text: 'IV access', on: true });
  if (st.access.io) chips.push({ text: 'IO access', on: true });
  if (st.access.art) chips.push({ text: 'Arterial line', on: true });
  for (const id of st.devices) chips.push({ text: label(LIBRARY.devices.devices, id), on: true });
  for (const f of st.fluidsRunning) {
    const name = label(LIBRARY.formulary.fluids, f.fluidId);
    chips.push({ text: `${name}: ${Math.round(f.pendingMl)} ml to go`, on: true });
  }
  for (const d of st.doses) {
    const name = label(LIBRARY.formulary.drugs, d.drugId);
    chips.push({ text: `${name} ×${d.count}, last ${fmtClock(st.t - d.lastT)} ago`, on: true });
  }
  for (const i of st.infusions) {
    const def = LIBRARY.formulary.drugs.find((d) => d.id === i.drugId);
    chips.push({
      text: `${def?.name ?? i.drugId} infusion ${i.rate} ${def?.infusion?.unit ?? ''}`.trim(),
      on: true,
    });
  }
  if (st.cpr) chips.push({ text: 'CPR in progress', on: true });
  if (st.helpCalled) chips.push({ text: 'Help called', on: true });
  if (!chips.length) chips.push({ text: 'No interventions yet', on: false });
  return chips;
}
