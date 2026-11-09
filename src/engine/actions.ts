/** Applies a clinician's action to the model and returns the resulting events. */
import { bandFor, fillTemplate, isNonVerbal, pickVariant, templateValues } from './narrative.ts';
import { pulseCheck, setCpr, shock } from './als.ts';
import { addDose, findRoute, newDrugState, sinceLastDose } from './pharmacology.ts';
import { context, event, o2Label, severityOf, type Model } from './model.ts';
import type { Action, AdverseRule, Route, SimEvent } from './types.ts';

type Of<K extends Action['kind']> = Extract<Action, { kind: K }>;

const NO_ACCESS = 'No IV access yet. Insert a cannula first.';

export const fmtDose = (n: number) => String(Number(n.toPrecision(6)));

const values = (m: Model) => templateValues(m.out.vitals, m.out.labs, o2Label(m));

function needsAccess(route: Route): boolean {
  return route === 'IV' || route === 'IO';
}

function hasAccess(m: Model, route: Route): boolean {
  return route === 'IO' ? m.s.access.io : m.s.access.iv || m.s.access.io;
}

function ruleFires(rule: AdverseRule, route: Route, dose: number, since: number, arrest: boolean) {
  if (rule.routes && !rule.routes.includes(route)) return false;
  if (rule.whenNotArrest && arrest) return false;
  if (rule.repeatWithinSec !== undefined && !(since < rule.repeatWithinSec)) return false;
  if (rule.doseAbove !== undefined && !(dose > rule.doseAbove)) return false;
  return true;
}

function giveDrug(m: Model, a: Of<'drug'>): SimEvent[] {
  const { s } = m;
  const def = m.defs.drugs.get(a.drugId);
  if (!def) return [event(m, 'warn', `unknown:drug:${a.drugId}`, `Unknown drug: ${a.drugId}.`)];
  const route = findRoute(def, a.route);
  if (!route) {
    return [
      event(
        m,
        'warn',
        `blocked:route:${def.id}:${a.route}`,
        `${def.name} can’t be given ${a.route}.`,
      ),
    ];
  }
  if (needsAccess(a.route) && !hasAccess(m, a.route)) {
    return [event(m, 'warn', `blocked:access:drug:${def.id}`, NO_ACCESS)];
  }
  if (!(a.dose > 0)) return [event(m, 'warn', `blocked:dose:${def.id}`, 'Choose a dose first.')];

  let state = s.drugs.find((d) => d.drugId === def.id);
  if (!state) {
    state = newDrugState(def.id);
    s.drugs.push(state);
  }
  const since = sinceLastDose(state, a.route, s.t);
  const fired = (def.adverse ?? []).filter((r) => ruleFires(r, a.route, a.dose, since, s.arrest));
  addDose(state, route, a.dose, s.t);

  const n = state.doses.length;
  const out: SimEvent[] = [
    event(
      m,
      'action',
      `drug:${def.id}:${a.route}`,
      `${def.name} ${fmtDose(a.dose)} ${def.unit} ${a.route} given (dose ${n}).`,
      { drug: def.id, route: a.route, dose: a.dose, unit: def.unit, n },
    ),
  ];
  if (route.maxDose !== undefined && a.dose > route.maxDose * 1.0001) {
    out.push(
      event(
        m,
        'warn',
        `dose-high:${def.id}`,
        `That’s above the usual ${a.route} dose (${fmtDose(route.standardDose)} ${def.unit}).`,
      ),
    );
  }
  if (route.minDose !== undefined && a.dose < route.minDose * 0.9999) {
    out.push(
      event(
        m,
        'warn',
        `dose-low:${def.id}`,
        `That’s below the usual ${a.route} dose (${fmtDose(route.standardDose)} ${def.unit}).`,
      ),
    );
  }
  for (const rule of fired) {
    out.push(event(m, rule.level, `adverse:${rule.id}`, rule.message, { harm: !!rule.harm }));
    if (rule.transient) s.transients.push({ ...rule.transient, sourceId: rule.id });
    if (rule.say) out.push(event(m, 'patient', `say:${rule.id}`, rule.say));
  }
  if (def.feedback) out.push(event(m, 'system', `note:drug:${def.id}`, def.feedback));
  return out;
}

function setInfusion(m: Model, a: Of<'infusion'>): SimEvent[] {
  const def = m.defs.drugs.get(a.drugId);
  const inf = def?.infusion;
  if (!def || !inf) {
    return [
      event(m, 'warn', `blocked:infusion:${a.drugId}`, 'That drug is not given as an infusion.'),
    ];
  }
  if (!hasAccess(m, 'IV'))
    return [event(m, 'warn', `blocked:access:infusion:${def.id}`, NO_ACCESS)];
  let state = m.s.drugs.find((d) => d.drugId === def.id);
  if (!state) {
    state = newDrugState(def.id);
    m.s.drugs.push(state);
  }
  const rate = Math.max(0, a.rate);
  const was = state.infusionRate;
  state.infusionRate = rate;
  if (rate === 0) {
    if (was === 0) return [event(m, 'system', `noop:infusion:${def.id}`, 'No infusion running.')];
    return [event(m, 'action', `infusion:${def.id}:stop`, `${def.name} infusion stopped.`)];
  }
  const out = [
    event(
      m,
      'action',
      `infusion:${def.id}`,
      `${def.name} infusion ${was > 0 ? 'changed to' : 'started at'} ${fmtDose(rate)} ${inf.unit}.`,
      { drug: def.id, rate, unit: inf.unit },
    ),
  ];
  if (rate > inf.maxRate * 1.0001 || rate < inf.minRate * 0.9999) {
    out.push(
      event(
        m,
        'warn',
        `rate-range:${def.id}`,
        `That's outside the usual range (${fmtDose(inf.minRate)}–${fmtDose(inf.maxRate)} ${inf.unit}).`,
      ),
    );
  }
  return out;
}

function giveFluid(m: Model, a: Of<'fluid'>): SimEvent[] {
  const def = m.defs.fluids.get(a.fluidId);
  if (!def) return [event(m, 'warn', `unknown:fluid:${a.fluidId}`, `Unknown fluid: ${a.fluidId}.`)];
  if (!hasAccess(m, 'IV')) return [event(m, 'warn', `blocked:access:fluid:${def.id}`, NO_ACCESS)];
  let f = m.s.fluids.find((x) => x.fluidId === def.id);
  if (f && f.pendingMl > 0) {
    return [event(m, 'system', `running:fluid:${def.id}`, 'A bolus is already running.')];
  }
  if (!f) {
    f = { fluidId: def.id, pendingMl: 0, circulatingMl: 0, totalMl: 0 };
    m.s.fluids.push(f);
  }
  f.pendingMl += a.volumeMl;
  return [
    event(
      m,
      'action',
      `fluid:${def.id}`,
      `${fmtDose(a.volumeMl)} ml ${def.name.toLowerCase()} bolus started.`,
      { fluid: def.id, volumeMl: a.volumeMl },
    ),
  ];
}

function setDevice(m: Model, a: Of<'device'>): SimEvent[] {
  const { s } = m;
  const def = m.defs.devices.get(a.deviceId);
  if (!def) return [event(m, 'warn', `unknown:device:${a.deviceId}`, `Unknown device.`)];
  const on = s.devices.includes(def.id);
  if (a.on === on) {
    const text = on ? `${def.label} is already on.` : `${def.label} isn’t on.`;
    return [event(m, 'system', `noop:device:${def.id}`, text)];
  }
  if (a.on) {
    if (def.category === 'oxygen') {
      s.devices = s.devices.filter((id) => m.defs.devices.get(id)?.category !== 'oxygen');
    }
    s.devices.push(def.id);
  } else {
    s.devices = s.devices.filter((id) => id !== def.id);
  }
  return [
    event(m, 'action', `device:${def.id}:${a.on ? 'on' : 'off'}`, a.on ? def.onText : def.offText),
  ];
}

function doProcedure(m: Model, a: Of<'procedure'>): SimEvent[] {
  const def = m.defs.procedures.get(a.procedureId);
  if (!def) return [event(m, 'warn', `unknown:procedure:${a.procedureId}`, `Unknown procedure.`)];
  const done = def.grants ? m.s.access[def.grants] : m.s.procedures[def.id] !== undefined;
  if (done) {
    const text = def.alreadyText ?? `${def.label}: already done.`;
    return [event(m, 'system', `noop:procedure:${def.id}`, text)];
  }
  if (def.grants) m.s.access[def.grants] = true;
  m.s.procedures[def.id] = m.s.t;
  return [event(m, 'action', `procedure:${def.id}`, def.doneText)];
}

function talk(m: Model, a: Of<'talk'>): SimEvent[] {
  const q = m.c.dialogue.find((d) => d.id === a.questionId);
  if (!q) return [event(m, 'warn', `unknown:talk:${a.questionId}`, 'Unknown question.')];
  const asked = event(m, 'action', `talk:${q.id}`, `You: ${q.q}`);
  if (m.s.arrest) {
    return [asked, event(m, 'patient', `answer:${q.id}`, 'No response.', { nonVerbal: true })];
  }
  const band = bandFor(m.c.bands, severityOf(m, m.c.bands.process));
  const raw = q.a[Math.min(band, q.a.length - 1)] ?? '';
  const text = fillTemplate(raw, values(m));
  return [asked, event(m, 'patient', `answer:${q.id}`, text, { nonVerbal: isNonVerbal(text) })];
}

function examine(m: Model, a: Of<'exam'>): SimEvent[] {
  const e = m.c.exam.find((x) => x.id === a.examId);
  if (!e) return [event(m, 'warn', `unknown:exam:${a.examId}`, 'Unknown examination.')];
  const text = fillTemplate(pickVariant(e.findings, context(m)), values(m));
  return [event(m, 'finding', `exam:${e.id}`, `${e.label}: ${text}`)];
}

function order(m: Model, a: Of<'order'>): SimEvent[] {
  const { s } = m;
  const def = m.defs.investigations.get(a.investigationId);
  if (!def) return [event(m, 'warn', `unknown:order:${a.investigationId}`, 'Unknown test.')];
  if (s.orders.some((o) => o.investigationId === def.id && !o.reported)) {
    return [event(m, 'system', `pending:${def.id}`, `${def.label}: already sent, waiting for it.`)];
  }
  const ci = m.c.investigations.find((x) => x.id === def.id);
  const raw = ci ? pickVariant(ci.results, context(m)) : 'No significant abnormality.';
  const text = fillTemplate(raw || 'No significant abnormality.', values(m));
  const dueT = s.t + Math.round(def.turnaroundMin * 60);
  const verb = def.category === 'bedside' ? 'done' : 'sent';
  const out: SimEvent[] = [event(m, 'action', `order:${def.id}`, `${def.label} ${verb}.`)];
  if (ci?.orderNote) out.push(event(m, 'system', `note:order:${def.id}`, ci.orderNote));
  const immediate = dueT <= s.t;
  s.orders.push({ investigationId: def.id, orderedT: s.t, dueT, text, reported: immediate });
  if (immediate) out.push(event(m, 'result', `result:${def.id}`, `${def.label}: ${text}`));
  return out;
}

function diagnose(m: Model, a: Of<'diagnosis'>): SimEvent[] {
  const opt = m.c.diagnosis.options.find((o) => o.id === a.diagnosisId);
  const label = opt?.label ?? a.diagnosisId;
  m.s.diagnosis = a.diagnosisId;
  return [event(m, 'action', `dx:${a.diagnosisId}`, `Working diagnosis: ${label}.`)];
}

function callHelp(m: Model): SimEvent[] {
  if (m.s.helpCalled) return [event(m, 'system', 'noop:help', 'Help is already on the way.')];
  m.s.helpCalled = true;
  return [event(m, 'action', 'help', 'Called for help — senior and crash team on the way.')];
}

export function applyAction(m: Model, a: Action): SimEvent[] {
  switch (a.kind) {
    case 'drug':
      return giveDrug(m, a);
    case 'infusion':
      return setInfusion(m, a);
    case 'cpr':
      return setCpr(m, a.on);
    case 'shock':
      return shock(m, a.joules);
    case 'pulse_check':
      return pulseCheck(m);
    case 'fluid':
      return giveFluid(m, a);
    case 'device':
      return setDevice(m, a);
    case 'procedure':
      return doProcedure(m, a);
    case 'talk':
      return talk(m, a);
    case 'exam':
      return examine(m, a);
    case 'order':
      return order(m, a);
    case 'diagnosis':
      return diagnose(m, a);
    case 'call_help':
      return callHelp(m);
  }
}
