/**
 * Phase 5 acceptance: nurse delays and refusals; exam mode hides hints;
 * seeded variations; OSCE domains.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../../../src/app/session.ts';
import { checkCase, TEAM } from '../../../src/content/library.ts';
import { SimpleEngine } from '../../../src/engine/engine.ts';
import { domainOf, scoreRun } from '../../../src/engine/scoring.ts';
import { Nurse } from '../../../src/engine/team.ts';
import { materialiseCase } from '../../../src/engine/variation.ts';
import type { Action, CaseDef, SimEvent } from '../../../src/engine/types.ts';
import { caseById, LIBRARY } from '../helpers.ts';

const codes = (evs: SimEvent[]) => evs.map((e) => e.code);

function setup(c: CaseDef = caseById('anaphylaxis-01'), seed = 1) {
  const engine = new SimpleEngine(LIBRARY);
  engine.load(c, seed);
  const nurse = new Nurse(engine, LIBRARY, TEAM, seed);
  /** Step one second at a time, letting the nurse act; returns everything that happened. */
  const run = (sec: number) => {
    const out: SimEvent[] = [];
    for (let i = 0; i < sec; i++) out.push(...engine.step(1), ...nurse.tick());
    return out;
  };
  return { engine, nurse, run };
}

/** Seconds until an event with this code appears. */
function timeTo(run: (s: number) => SimEvent[], code: string, max = 600): number {
  for (let t = 1; t <= max; t++) if (run(1).some((e) => e.code === code)) return t;
  return Infinity;
}

describe('nurse: closed-loop orders with realistic delays', () => {
  it('reads back at once, then puts in a cannula after 60–120 s', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { nurse, run } = setup(undefined, seed);
      const back = nurse.request({ kind: 'procedure', procedureId: 'iv_access' });
      expect(back[0]?.type).toBe('nurse');
      expect(back[0]?.text).toMatch(/^IV cannula\. Getting the kit ready\.$/);
      expect(nurse.pending).toHaveLength(1);
      const t = timeTo(run, 'procedure:iv_access');
      expect(t).toBeGreaterThanOrEqual(60);
      expect(t).toBeLessThanOrEqual(121);
      expect(nurse.pending).toHaveLength(0);
    }
  });

  it('draws up a drug in 30–60 s, but arrest drugs in 10–20 s', () => {
    const { nurse, run } = setup();
    nurse.request({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 });
    const t = timeTo(run, 'drug:adrenaline:IM');
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThanOrEqual(61);

    const arrest = setup(caseById('anaphylaxis-01'), 2);
    arrest.engine.apply({ kind: 'procedure', procedureId: 'iv_access' });
    arrest.engine.apply({ kind: 'device', deviceId: 'defib_pads', on: true });
    arrest.engine.apply({ kind: 'shock', joules: 150 }); // shock with a pulse → VF
    expect(arrest.engine.status().arrest).toBe(true);
    arrest.nurse.request({ kind: 'drug', drugId: 'adrenaline', route: 'IV', dose: 1 });
    const ta = timeTo(arrest.run, 'drug:adrenaline:IV');
    expect(ta).toBeGreaterThanOrEqual(10);
    expect(ta).toBeLessThanOrEqual(21);
  });

  it('does clinician tasks (talk, exam, shock, CPR) immediately, and says when it is already busy', () => {
    const { nurse } = setup();
    expect(codes(nurse.request({ kind: 'talk', questionId: 'allergy' }))[0]).toBe('talk:allergy');
    expect(codes(nurse.request({ kind: 'exam', examId: 'A' }))).toEqual(['exam:A']);
    const o2: Action = { kind: 'device', deviceId: 'o2_nrb', on: true };
    nurse.request(o2);
    expect(codes(nurse.request(o2))).toEqual(['nurse:busy']);
  });

  it('queries an allergy and only gives the drug if the clinician insists', () => {
    const base = caseById('sepsis-01');
    const allergic: CaseDef = { ...base, patient: { ...base.patient, allergies: ['penicillin'] } };
    const { engine, nurse, run } = setup(allergic);
    engine.apply({ kind: 'procedure', procedureId: 'iv_access' });
    const abx: Action = { kind: 'drug', drugId: 'piperacillin_tazobactam', route: 'IV', dose: 4.5 };
    const q = nurse.request(abx);
    expect(codes(q)).toEqual(['nurse:query:allergy']);
    expect(q[0]?.text).toBe(
      "She's allergic to penicillin. Do you still want piperacillin–tazobactam?",
    );
    const id = Number(q[0]?.data?.['queryId']);
    expect(codes(nurse.cancel(id))).toEqual(['nurse:cancelled:allergy']);
    expect(codes(run(120))).not.toContain('drug:piperacillin_tazobactam:IV');

    const q2 = nurse.request(abx);
    nurse.confirm(Number(q2[0]?.data?.['queryId']));
    const later = run(120);
    expect(codes(later)).toContain('drug:piperacillin_tazobactam:IV');
    const reaction = later.find((e) => e.code === 'allergy:piperacillin_tazobactam');
    expect(reaction?.data?.['harm']).toBe(true);
  });

  it('queries contraindications: nitrate with low BP, potassium when K⁺ is high', () => {
    const ana = setup(caseById('anaphylaxis-01'), 1);
    ana.run(240); // anaphylaxis has dropped his SBP below 90
    expect(ana.engine.vitals().sbp ?? 999).toBeLessThan(90);
    expect(
      codes(ana.nurse.request({ kind: 'drug', drugId: 'gtn', route: 'SL', dose: 0.4 })),
    ).toEqual(['nurse:query:contraindication']);

    const hk = setup(caseById('hyperk-01'), 1);
    hk.engine.apply({ kind: 'procedure', procedureId: 'iv_access' });
    const q = hk.nurse.request({
      kind: 'drug',
      drugId: 'potassium_chloride',
      route: 'IV',
      dose: 40,
    });
    expect(q[0]?.text).toBe('Potassium is already 5.5 mmol/L or more. Do you still want it?');
  });

  it('queries doses more than twice the usual maximum', () => {
    const { nurse } = setup();
    const q = nurse.request({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 5 });
    expect(codes(q)).toEqual(['nurse:query:dose']);
  });

  it('offers a cannula first when an IV order has no access, then gives the drug after it', () => {
    const { nurse, run } = setup();
    const q = nurse.request({ kind: 'drug', drugId: 'chlorphenamine', route: 'IV', dose: 10 });
    expect(codes(q)).toEqual(['nurse:query:access']);
    nurse.confirm(Number(q[0]?.data?.['queryId']));
    expect(nurse.pending.map((p) => p.action.kind)).toEqual(['procedure', 'drug']);
    const evs = run(240);
    const tCannula = evs.find((e) => e.code === 'procedure:iv_access')?.t ?? Infinity;
    const tDrug = evs.find((e) => e.code === 'drug:chlorphenamine:IV')?.t ?? -1;
    expect(tDrug).toBeGreaterThan(tCannula);
    expect(codes(evs)).not.toContain('blocked:access:drug:chlorphenamine');
  });

  it('snapshots and restores its queue', () => {
    const a = setup();
    a.nurse.request({ kind: 'procedure', procedureId: 'iv_access' });
    const snap = a.nurse.snapshot();
    const b = setup();
    b.nurse.restore(snap);
    expect(b.nurse.pending).toEqual(a.nurse.pending);
  });
});

describe('guided and exam modes', () => {
  const idle = (mode: 'guided' | 'exam') => {
    const s = new Session(caseById('anaphylaxis-01'), 3, undefined, { mode, variation: false });
    s.start();
    for (let i = 0; i < 180; i++) s.advance(1);
    return s;
  };

  it('guided mode offers hints after a minute without action', () => {
    const s = idle('guided');
    const hints = s.events.filter((e) => e.code.startsWith('nurse:hint:'));
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints[0]?.t).toBeGreaterThanOrEqual(60);
  });

  it('exam mode gives no hints or prompts and hides teaching notes', () => {
    const s = idle('exam');
    expect(s.events.some((e) => e.type === 'nurse' && !e.code.startsWith('nurse:readback'))).toBe(
      false,
    );
    s.act({ kind: 'procedure', procedureId: 'iv_access' });
    for (let i = 0; i < 130; i++) s.advance(1);
    s.act({ kind: 'drug', drugId: 'chlorphenamine', route: 'IV', dose: 10 });
    for (let i = 0; i < 70; i++) s.advance(1);
    expect(s.events.some((e) => e.code === 'drug:chlorphenamine:IV')).toBe(true);
    expect(s.events.some((e) => e.code.startsWith('note:drug:'))).toBe(false);
    expect(s.events.some((e) => e.code.startsWith('nurse:hint:'))).toBe(false);
  });
});

describe('seeded case variation', () => {
  const sepsis = caseById('sepsis-01');

  it('is deterministic, stays in range and still validates', () => {
    const a = materialiseCase(sepsis, 7);
    expect(materialiseCase(sepsis, 7)).toEqual(a);
    for (let seed = 1; seed <= 30; seed++) {
      const m = materialiseCase(sepsis, seed);
      expect(m.caseDef.patient.age).toBeGreaterThanOrEqual(68);
      expect(m.caseDef.patient.age).toBeLessThanOrEqual(84);
      expect(m.caseDef.patient.weightKg).toBeGreaterThanOrEqual(52);
      expect(m.caseDef.patient.weightKg).toBeLessThanOrEqual(74);
      const r = checkCase(m.caseDef);
      expect(r.ok ? [] : r.issues).toEqual([]);
    }
  });

  it('sometimes gives a penicillin allergy, and the history reveals it', () => {
    const variants = Array.from({ length: 40 }, (_, i) => materialiseCase(sepsis, i + 1));
    const allergic = variants.filter((v) => v.caseDef.patient.allergies?.includes('penicillin'));
    expect(allergic.length).toBeGreaterThan(5);
    expect(allergic.length).toBeLessThan(35);
    const one = allergic[0]!.caseDef;
    expect(one.dialogue.find((d) => d.id === 'allergy')?.a[0]).toMatch(/^Penicillin/);
    expect(sepsis.dialogue.find((d) => d.id === 'allergy')?.a[0]).toMatch(/^No/);
  });

  it('the session treats the varied patient but keeps the authored case for restarts', () => {
    const s = new Session(sepsis, 11);
    expect(s.baseCase).toBe(sepsis);
    expect(s.engine.caseDef).toBe(s.caseDef);
  });
});

describe('OSCE domains', () => {
  it('infers domains from the rule type and reports a pass mark', () => {
    const c = caseById('anaphylaxis-01');
    const byId = Object.fromEntries(c.scoring.map((r) => [r.id, domainOf(r)]));
    expect(byId).toMatchObject({
      abcde: 'assessment',
      allergy: 'assessment',
      dx: 'diagnosis',
      'adr-given': 'management',
      'no-iv-bolus': 'safety',
    });
    const none = scoreRun(c, { events: [], trace: [], outcome: 'died', diagnosis: null });
    expect(none.pass).toBe(false);
    expect(none.domains.management.max).toBeGreaterThan(0);
  });
});
