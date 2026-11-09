/**
 * Cross-reference checks that a schema alone can't express: every id a case
 * mentions must exist in the case or in the shared library.
 */
import type { RuleTest } from '../engine/caseTypes.ts';
import type { CaseDef, Condition, EngineLibrary } from '../engine/types.ts';

function dupes(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const x of ids) (seen.has(x) ? out : seen).add(x);
  return [...out];
}

function walkCondition(c: Condition, visit: (c: Condition) => void): void {
  visit(c);
  if ('all' in c) c.all.forEach((x) => walkCondition(x, visit));
  else if ('any' in c) c.any.forEach((x) => walkCondition(x, visit));
  else if ('not' in c) walkCondition(c.not, visit);
}

function walkRule(t: RuleTest, visit: (t: RuleTest) => void): void {
  visit(t);
  if (t.type === 'all' || t.type === 'any') t.tests.forEach((x) => walkRule(x, visit));
  else if (t.type === 'not') walkRule(t.test, visit);
}

export function validateCaseRefs(c: CaseDef, lib: EngineLibrary): string[] {
  const errors: string[] = [];
  const processIds = new Set(c.processes.map((p) => p.id));
  const drugIds = new Set(lib.formulary.drugs.map((d) => d.id));
  const deviceIds = new Set(lib.devices.devices.map((d) => d.id));
  const procIds = new Set(lib.devices.procedures.map((p) => p.id));
  const infusionIds = new Set(lib.formulary.drugs.filter((d) => d.infusion).map((d) => d.id));
  const invIds = new Set(lib.investigations.investigations.map((i) => i.id));
  const ruleIds = new Set(c.scoring.map((r) => r.id));
  const examIds = new Set(c.exam.map((e) => e.id));
  const talkIds = new Set(c.dialogue.map((d) => d.id));
  const dxIds = new Set(c.diagnosis.options.map((o) => o.id));

  const lists: [string, readonly { id: string }[]][] = [
    ['process', c.processes],
    ['dialogue', c.dialogue],
    ['exam', c.exam],
    ['investigation', c.investigations],
    ['patient line', c.patientLines],
    ['scoring rule', c.scoring],
    ['teaching point', c.teaching],
    ['diagnosis option', c.diagnosis.options],
  ];
  for (const [what, xs] of lists) {
    for (const d of dupes(xs.map((x) => x.id))) errors.push(`Duplicate ${what} id "${d}".`);
  }

  if (!processIds.has(c.bands.process)) {
    errors.push(`bands.process "${c.bands.process}" is not a process in this case.`);
  }
  const nBands = c.bands.cutoffs.length + 1;
  for (const d of c.dialogue) {
    if (d.a.length !== nBands) {
      errors.push(
        `Dialogue "${d.id}" has ${d.a.length} answers; expected ${nBands} (one per band).`,
      );
    }
  }
  for (const inv of c.investigations) {
    if (!invIds.has(inv.id))
      errors.push(`Investigation "${inv.id}" is not in investigations.json.`);
  }
  for (const id of c.diagnosis.correct) {
    if (!dxIds.has(id)) errors.push(`Correct diagnosis "${id}" is not one of the options.`);
  }

  const checkCond = (where: string) => (x: Condition) => {
    if ('severity' in x && !processIds.has(x.severity)) {
      errors.push(`${where}: unknown process "${x.severity}".`);
    }
    if ('drugGiven' in x && !drugIds.has(x.drugGiven)) {
      errors.push(`${where}: unknown drug "${x.drugGiven}".`);
    }
    if ('device' in x && !deviceIds.has(x.device)) {
      errors.push(`${where}: unknown device "${x.device}".`);
    }
    if ('procedure' in x && !procIds.has(x.procedure)) {
      errors.push(`${where}: unknown procedure "${x.procedure}".`);
    }
    if ('infusing' in x && !infusionIds.has(x.infusing)) {
      errors.push(`${where}: "${x.infusing}" has no infusion in the formulary.`);
    }
  };
  c.exam.forEach((e) =>
    e.findings.forEach((f) => f.when && walkCondition(f.when, checkCond(`exam ${e.id}`))),
  );
  c.investigations.forEach((i) =>
    i.results.forEach((r) => r.when && walkCondition(r.when, checkCond(`investigation ${i.id}`))),
  );
  c.patientLines.forEach((l) => walkCondition(l.when, checkCond(`patient line ${l.id}`)));
  (c.rhythmRules ?? []).forEach((r) => walkCondition(r.when, checkCond(`rhythm rule ${r.id}`)));
  walkCondition(c.outcomes.stabilised.when, checkCond('outcomes.stabilised'));
  for (const p of c.processes) {
    for (const tr of p.treatments ?? []) {
      walkCondition(tr.when, checkCond(`treatment ${p.id}.${tr.id}`));
    }
  }

  const checkRule = (where: string) => (t: RuleTest) => {
    if ((t.type === 'rulePassed' || t.type === 'ruleFailed') && !ruleIds.has(t.id)) {
      errors.push(`${where}: unknown scoring rule "${t.id}".`);
    }
    if (t.type === 'examined') {
      for (const id of t.ids) if (!examIds.has(id)) errors.push(`${where}: unknown exam "${id}".`);
    }
    if (t.type === 'asked') {
      for (const id of t.ids) {
        if (!talkIds.has(id)) errors.push(`${where}: unknown question "${id}".`);
      }
    }
    if (t.type === 'diagnosisIs') {
      for (const id of t.ids)
        if (!dxIds.has(id)) errors.push(`${where}: unknown diagnosis "${id}".`);
    }
  };
  c.scoring.forEach((r) => walkRule(r.test, checkRule(`scoring rule ${r.id}`)));
  c.teaching.forEach((tp) => tp.showIf && walkRule(tp.showIf, checkRule(`teaching ${tp.id}`)));

  return errors;
}
