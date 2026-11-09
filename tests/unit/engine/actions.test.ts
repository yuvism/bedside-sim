import { describe, expect, it } from 'vitest';
import { SimpleEngine } from '../../../src/engine/engine.ts';
import { Recorder } from '../../../src/engine/recorder.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { caseById, imAdrenaline, LIBRARY, min } from '../helpers.ts';

const CASE = caseById('anaphylaxis-01');

function engine(seed = 3) {
  const e = new SimpleEngine(LIBRARY);
  e.load(CASE, seed);
  return e;
}
const codes = (evs: { code: string }[]) => evs.map((e) => e.code);

describe('engine actions', () => {
  it('needs IV access for IV drugs and fluids', () => {
    const e = engine();
    expect(codes(e.apply({ kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }))).toEqual([
      'blocked:access:fluid:crystalloid',
    ]);
    e.apply({ kind: 'procedure', procedureId: 'iv_access' });
    expect(codes(e.apply({ kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 }))).toEqual([
      'fluid:crystalloid',
    ]);
    expect(e.status().fluidsRunning[0]?.pendingMl).toBe(500);
    const done = e.step(6 * 60);
    expect(codes(done)).toContain('done:fluid:crystalloid');
    expect(codes(e.apply({ kind: 'procedure', procedureId: 'iv_access' }))).toEqual([
      'noop:procedure:iv_access',
    ]);
  });

  it('flags IV bolus adrenaline outside arrest as harmful, with a BP and HR surge', () => {
    const e = engine();
    e.apply({ kind: 'procedure', procedureId: 'iv_access' });
    const before = e.vitals();
    const evs = e.apply({ kind: 'drug', drugId: 'adrenaline', route: 'IV', dose: 1 });
    const adverse = evs.find((x) => x.code === 'adverse:iv_bolus_outside_arrest');
    expect(adverse?.type).toBe('danger');
    expect(adverse?.data?.['harm']).toBe(true);
    expect(codes(evs)).toContain('say:iv_bolus_outside_arrest');
    const after = e.vitals();
    expect(after.sbp!).toBeGreaterThan(before.sbp! + 40);
    expect(after.hr!).toBeGreaterThan(before.hr! + 30);
    expect(after.ectopy).toBe(true);
  });

  it('warns about repeat IM doses within 3 minutes, not after 5', () => {
    const e = engine();
    e.apply({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 });
    e.step(60);
    expect(
      codes(e.apply({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 })),
    ).toContain('adverse:im_repeat_early');
    e.step(300);
    expect(
      codes(e.apply({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 })),
    ).not.toContain('adverse:im_repeat_early');
    expect(e.status().doses.find((d) => d.drugId === 'adrenaline')?.count).toBe(3);
  });

  it('switches oxygen devices exclusively and raises SpO2', () => {
    const e = engine();
    e.step(min(6));
    const air = e.vitals().spo2!;
    e.apply({ kind: 'device', deviceId: 'o2_nasal', on: true });
    e.apply({ kind: 'device', deviceId: 'o2_nrb', on: true });
    expect(e.status().devices).toEqual(['o2_nrb']);
    expect(e.vitals().spo2!).toBeGreaterThan(air);
    expect(codes(e.apply({ kind: 'device', deviceId: 'o2_nrb', on: true }))).toEqual([
      'noop:device:o2_nrb',
    ]);
  });

  it('answers by severity band and resolves exam text from live vitals', () => {
    const e = engine();
    const early = e.apply({ kind: 'talk', questionId: 'allergy' });
    expect(early[1]?.text).toBe('I’m allergic to peanuts. They told me there weren’t any.');
    e.step(min(9));
    const late = e.apply({ kind: 'talk', questionId: 'breath' });
    expect(late[1]?.data?.['nonVerbal']).toBe(true);
    const b = e.apply({ kind: 'exam', examId: 'B' })[0];
    expect(b?.text).toMatch(/^Breathing: RR \d+\/min, SpO₂ \d+% on air\./);
  });

  it('returns bedside results now and lab results after their turnaround', () => {
    const e = engine();
    const glu = e.apply({ kind: 'order', investigationId: 'glu' });
    expect(codes(glu)).toEqual(['order:glu', 'result:glu']);
    expect(glu[1]?.text).toBe('Capillary glucose: Glucose 5.8 mmol/L.');
    const abg = e.apply({ kind: 'order', investigationId: 'abg' });
    expect(codes(abg)).toEqual(['order:abg']);
    expect(e.status().pendingOrders).toEqual([{ investigationId: 'abg', dueT: 120 }]);
    const later = e.step(120);
    expect(later.find((x) => x.code === 'result:abg')?.text).toMatch(
      /^Arterial blood gas: pH 7\.\d\d/,
    );
  });

  it('logs diagnosis and help', () => {
    const e = engine();
    expect(e.apply({ kind: 'diagnosis', diagnosisId: 'anaphylaxis' })[0]?.text).toBe(
      'Working diagnosis: Anaphylaxis.',
    );
    expect(codes(e.apply({ kind: 'call_help' }))).toEqual(['help']);
    expect(codes(e.apply({ kind: 'call_help' }))).toEqual(['noop:help']);
  });

  it('speaks threshold lines once as the patient deteriorates', () => {
    const r = runScript(LIBRARY, CASE, 5, [], { maxSec: min(30) });
    const lines = r.events.filter((x) => x.code.startsWith('line:')).map((x) => x.code);
    expect(lines).toEqual(['line:faint', 'line:cant-breathe']);
    expect(r.events.at(-1)?.code).toBe('outcome:arrest');
    expect(r.final.rhythm).toBe('pea');
  });
});

describe('recorder', () => {
  it('samples every 15 s and exports JSON and CSV that line up', () => {
    const r = runScript(LIBRARY, CASE, 11, [imAdrenaline(30)], {
      maxSec: 60,
      stopOnOutcome: false,
    });
    expect(r.trace.map((x) => x.t)).toEqual([0, 15, 30, 45, 60]);
    const csv = r.recorder.traceCSV().trim().split('\n');
    expect(csv[0]).toBe('t_sec,hr,sbp,dbp,map,spo2,rr,etco2,temp,gcs,rhythm,event');
    expect(csv).toHaveLength(6);
    // header, then t = 0, 15, 30 …; the dose at t = 30 lands on the 30 s row
    expect(csv[3]?.startsWith('30,')).toBe(true);
    expect(csv[3]?.endsWith(',drug:adrenaline:IM')).toBe(true);
    const json = r.recorder.toJSON({
      caseId: CASE.id,
      caseVersion: CASE.version,
      seed: 11,
      outcome: r.outcome,
      diagnosis: null,
      score: null,
      durationSec: r.endT,
    });
    expect(json.vitals).toHaveLength(5);
    expect(json.events[0]?.code).toBe('drug:adrenaline:IM');
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it('quotes CSV cells that contain commas or quotes', () => {
    const rec = new Recorder();
    rec.add([{ t: 1, type: 'system', code: 'x', text: 'a, "b"' }]);
    expect(rec.eventsCSV()).toBe('t_sec,type,code,text\n1,system,x,"a, ""b"""\n');
  });
});
