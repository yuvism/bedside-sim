/**
 * "Ideal clinician" policies for each case: a timed script of first actions
 * plus reactive rules (repeat doses, titration, ALS if the patient arrests).
 */
import type { SimpleEngine } from '../../../src/engine/engine.ts';
import type { Policy, ScriptStep } from '../../../src/engine/replay.ts';
import type { Action, Route } from '../../../src/engine/types.ts';

type Rule = (e: SimpleEngine, mem: Record<string, number>) => Action[] | undefined;

const drug = (drugId: string, route: Route, dose: number): Action => ({
  kind: 'drug',
  drugId,
  route,
  dose,
});
const dev = (deviceId: string, on = true): Action => ({ kind: 'device', deviceId, on });
const proc = (procedureId: string): Action => ({ kind: 'procedure', procedureId });
const order = (investigationId: string): Action => ({ kind: 'order', investigationId });
const talk = (questionId: string): Action => ({ kind: 'talk', questionId });
const exam = (examId: string): Action => ({ kind: 'exam', examId });
const dx = (diagnosisId: string): Action => ({ kind: 'diagnosis', diagnosisId });
const at = (t: number, ...actions: Action[]): ScriptStep[] =>
  actions.map((action) => ({ t, action }));
const abcde = (t: number) => ['A', 'B', 'C', 'D', 'E'].flatMap((id, i) => at(t + i * 3, exam(id)));

/** Every `gap` seconds at most, keyed by name. */
const every = (mem: Record<string, number>, key: string, now: number, gap: number) => {
  if (now - (mem[key] ?? -Infinity) < gap) return false;
  mem[key] = now;
  return true;
};

/** Standard ALS: pads, CPR, shock every 2 min if shockable, adrenaline, amiodarone. */
export const alsRule: Rule = (e, mem) => {
  const st = e.status();
  if (!st.arrest) {
    mem['shocks'] = 0;
    return undefined;
  }
  const out: Action[] = [];
  if (!st.devices.includes('defib_pads')) out.push(dev('defib_pads'));
  if (!st.access.iv && !st.access.io) out.push(proc('iv_access'));
  const shockable = ['vf', 'pvt'].includes(e.vitals().rhythm);
  // A shock or pulse check is all that happens in that second: see the result before giving drugs.
  if (shockable && every(mem, 'cycle', e.time, 120)) {
    mem['shocks'] = (mem['shocks'] ?? 0) + 1;
    return [...out, { kind: 'shock', joules: 150 }];
  }
  if (!shockable && every(mem, 'cycle', e.time, 120)) return [...out, { kind: 'pulse_check' }];
  if (!st.cpr) out.push({ kind: 'cpr', on: true });
  const shocks = mem['shocks'] ?? 0;
  if ((!shockable || shocks >= 3) && every(mem, 'adr', e.time, 240))
    out.push(drug('adrenaline', 'IV', 1));
  if (shockable && shocks === 3 && every(mem, 'amio', e.time, 3600))
    out.push(drug('amiodarone', 'IV', 300));
  return out;
};

function build(script: ScriptStep[], rules: Rule[] = []): () => Policy {
  return () => {
    const steps = [...script].sort((a, b) => a.t - b.t);
    let i = 0;
    const mem: Record<string, number> = {};
    return (e) => {
      const out: Action[] = [];
      while (i < steps.length && (steps[i]?.t ?? Infinity) <= e.time) out.push(steps[i++]!.action);
      for (const r of [alsRule, ...rules]) out.push(...(r(e, mem) ?? []));
      return out;
    };
  };
}

const lab = (e: SimpleEngine, k: string) => e.labs()[k] ?? NaN;

export const IDEAL: Record<string, () => Policy> = {
  'anaphylaxis-01': build([
    ...at(5, { kind: 'call_help' }),
    ...at(10, talk('allergy')),
    ...abcde(15),
    ...at(45, dev('o2_nrb')),
    ...at(60, drug('adrenaline', 'IM', 0.5)),
    ...at(70, proc('iv_access')),
    ...at(80, { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }),
    ...at(90, dx('anaphylaxis')),
    ...at(360, drug('adrenaline', 'IM', 0.5)),
  ]),

  'asthma-02': build([
    ...at(0, { kind: 'call_help' }, dev('bvm')),
    ...at(5, proc('iv_access')),
    ...['A', 'B', 'C'].flatMap((id, i) => at(10 + i * 3, exam(id))),
    ...at(30, drug('salbutamol', 'NEB', 5)),
    ...at(60, proc('tracheal_intubation')),
    ...at(120, drug('magnesium_sulfate', 'IV', 2)),
    ...at(130, drug('hydrocortisone', 'IV', 100)),
    ...at(140, drug('salbutamol', 'IV', 0.25)),
    ...at(150, order('abg')),
    ...at(160, dx('asthma')),
    ...at(600, drug('salbutamol', 'NEB', 5)),
  ]),

  'asthma-01': build(
    [
      ...at(5, { kind: 'call_help' }),
      ...abcde(10),
      ...at(30, dev('o2_nrb')),
      ...at(40, drug('salbutamol', 'NEB', 5)),
      ...at(50, drug('ipratropium', 'NEB', 0.5)),
      ...at(60, proc('iv_access'), order('pef'), order('vbg')),
      ...at(90, drug('hydrocortisone', 'IV', 100)),
      ...at(100, talk('icu'), dx('asthma')),
      ...at(600, drug('magnesium_sulfate', 'IV', 2)),
    ],
    [
      (e, mem) =>
        every(mem, 'salb', e.time, 900) && e.time > 60 ? [drug('salbutamol', 'NEB', 5)] : undefined,
    ],
  ),

  'stemi-01': build([
    ...at(5, dev('defib_pads')),
    ...at(10, order('ecg')),
    ...at(20, talk('pain')),
    ...at(30, proc('iv_access')),
    ...at(40, drug('aspirin', 'PO', 300)),
    ...at(50, proc('pci')),
    ...at(60, drug('ticagrelor', 'PO', 180)),
    ...at(90, drug('gtn', 'SL', 0.4)),
    ...at(100, dx('stemi')),
    ...abcde(110),
  ]),

  'sepsis-01': build(
    [
      ...at(5, { kind: 'call_help' }),
      ...abcde(10),
      ...at(40, dev('o2_nrb')),
      ...at(50, proc('iv_access')),
      ...at(60, order('cultures'), order('vbg')),
      ...at(80, talk('allergy')),
      ...at(90, drug('piperacillin_tazobactam', 'IV', 4.5)),
      ...at(100, { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }),
      ...at(120, proc('urinary_catheter'), order('cxr')),
      ...at(130, proc('critical_care'), dx('sepsis')),
      ...at(420, { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }),
    ],
    [
      (e, mem) => {
        if (e.time < 700) return undefined;
        const map = e.vitals().map ?? 0;
        const rate = e.status().infusions.find((i) => i.drugId === 'noradrenaline')?.rate ?? 0;
        if (map < 68 && rate < 0.6 && every(mem, 'nor', e.time, 120)) {
          return [
            {
              kind: 'infusion',
              drugId: 'noradrenaline',
              rate: Math.round((rate + 0.1) * 100) / 100,
            },
          ];
        }
        return undefined;
      },
    ],
  ),

  'dka-01': build(
    [
      ...at(10, order('glu'), order('ketones')),
      ...at(30, order('vbg'), proc('iv_access')),
      ...at(50, { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }),
      ...at(60, { kind: 'infusion', drugId: 'insulin', rate: 0.1 }),
      ...at(70, talk('insulin'), dx('dka')),
      ...abcde(80),
    ],
    [
      (e, mem) =>
        e.time > 400 && every(mem, 'fluid', e.time, 900)
          ? [{ kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }]
          : undefined,
      (e, mem) => (every(mem, 'glu', e.time, 600) && e.time > 300 ? [order('glu')] : undefined),
      (e, mem) => {
        const k = lab(e, 'k');
        if (e.time > 300 && k <= 5.5 && every(mem, 'kcl', e.time, 3600))
          return [order('vbg'), drug('potassium_chloride', 'IV', 40)];
        return undefined;
      },
      (e) => {
        const g = e.vitals().glucose;
        const on = e.status().infusions.some((i) => i.drugId === 'glucose_10');
        return g < 14 && !on ? [{ kind: 'infusion', drugId: 'glucose_10', rate: 125 }] : undefined;
      },
    ],
  ),

  'hypo-01': build(
    [
      ...at(10, exam('A')),
      ...at(20, order('glu')),
      ...at(40, proc('iv_access')),
      ...at(50, drug('glucose_10', 'IV', 150)),
      ...abcde(60),
      ...at(400, order('glu')),
      ...at(420, { kind: 'infusion', drugId: 'glucose_10', rate: 125 }),
      ...at(450, talk('meds'), dx('hypoglycaemia')),
    ],
    [
      (e, mem) =>
        e.time > 300 && e.vitals().glucose < 4 && every(mem, 'g10', e.time, 300)
          ? [drug('glucose_10', 'IV', 150)]
          : undefined,
      (e, mem) =>
        e.vitals().gcs >= 14 && every(mem, 'eat', e.time, 99999) ? [talk('eat-now')] : undefined,
    ],
  ),

  'opioid-01': build(
    [
      ...at(5, dev('airway_manoeuvres')),
      ...at(15, dev('bvm')),
      ...at(20, { kind: 'call_help' }),
      ...at(30, order('glu')),
      ...at(40, proc('iv_access')),
      ...at(50, drug('naloxone', 'IV', 0.4)),
      ...at(60, exam('D'), exam('head'), talk('other'), dx('opioid')),
    ],
    [
      (e, mem) => {
        if (e.time < 170) return undefined;
        const st = e.status();
        const out: Action[] = [];
        if (e.vitals().rr < 10 && every(mem, 'nal', e.time, 150))
          out.push(drug('naloxone', 'IV', 0.4));
        if (st.devices.includes('bvm') && e.vitals().rr >= 10)
          out.push(dev('bvm', false), dev('o2_nrb'));
        if (e.vitals().gcs >= 13 && every(mem, 'support', e.time, 99999)) out.push(talk('support'));
        return out;
      },
    ],
  ),

  'tension-01': build([
    ...at(5, { kind: 'call_help' }),
    ...at(10, dev('o2_nrb')),
    ...abcde(15),
    ...at(45, exam('neck'), exam('chest')),
    ...at(60, proc('needle_decompression')),
    ...at(90, proc('iv_access')),
    ...at(120, order('fast')),
    ...at(240, proc('chest_drain')),
    ...at(250, dx('tension')),
  ]),

  'haemorrhage-01': build(
    [
      ...at(5, { kind: 'call_help' }),
      ...abcde(10),
      ...at(30, proc('pelvic_binder')),
      ...at(40, proc('iv_access')),
      ...at(50, proc('mhp')),
      ...at(60, proc('haemorrhage_control')),
      ...at(70, drug('tranexamic_acid', 'IV', 1)),
      ...at(80, { kind: 'fluid', fluidId: 'blood', volumeMl: 300 }),
      ...at(120, order('xray_pelvis'), dx('pelvic-haemorrhage')),
    ],
    [
      (e, mem) => {
        const running = e.status().fluidsRunning.length > 0;
        if (e.time < 120 || running || (e.vitals().sbp ?? 0) >= 90) return undefined;
        if (!every(mem, 'product', e.time, 60)) return undefined;
        mem['n'] = (mem['n'] ?? 0) + 1;
        return [
          {
            kind: 'fluid',
            fluidId: (mem['n'] ?? 0) % 2 ? 'blood' : 'ffp',
            volumeMl: (mem['n'] ?? 0) % 2 ? 300 : 250,
          },
        ];
      },
    ],
  ),

  'hyperk-01': build(
    [
      ...at(5, dev('defib_pads')),
      ...at(10, order('ecg')),
      ...at(20, order('vbg')),
      ...at(30, proc('iv_access')),
      ...at(40, drug('calcium_gluconate', 'IV', 30)),
      ...at(60, drug('insulin', 'IV', 10), drug('glucose_50', 'IV', 50)),
      ...at(80, drug('salbutamol', 'NEB', 10)),
      ...at(100, proc('renal_referral'), dx('hyperkalaemia')),
      ...abcde(110),
    ],
    [
      (e, mem) => (e.time > 600 && every(mem, 'glu', e.time, 600) ? [order('glu')] : undefined),
      (e, mem) =>
        e.vitals().glucose < 4 && every(mem, 'g10', e.time, 300)
          ? [drug('glucose_10', 'IV', 150)]
          : undefined,
      (e, mem) => {
        if (lab(e, 'k') >= 6.5 && e.time > 900 && every(mem, 'shift', e.time, 1200)) {
          return [drug('insulin', 'IV', 10), drug('glucose_50', 'IV', 50)];
        }
        if (lab(e, 'k') >= 7 && every(mem, 'ca', e.time, 1800) && e.time > 1800)
          return [drug('calcium_gluconate', 'IV', 30)];
        return undefined;
      },
    ],
  ),
};
