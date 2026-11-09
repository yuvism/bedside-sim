import { describe, expect, it } from 'vitest';
import { useSim } from '../../../src/app/store.ts';
import type { EngineStatus } from '../../../src/engine/engine.ts';
import {
  BAY_TARGETS,
  bayStateOf,
  breathScale,
  CPR_RATE,
  mix,
  oxygenKind,
  skinColour,
  targetAction,
} from '../../../src/ui/bay/bayModel.ts';
import { drawScreen } from '../../../src/ui/bay/screen.ts';

const STATUS: EngineStatus = {
  t: 0,
  arrest: false,
  outcome: null,
  devices: [],
  access: { iv: false, io: false, art: false },
  fluidsRunning: [],
  infusions: [],
  cpr: false,
  als: null,
  procedures: {},
  doses: [],
  pendingOrders: [],
  helpCalled: false,
  diagnosis: null,
};

const channel = (c: number, shift: number) => (c >> shift) & 0xff;

describe('3D bay targets', () => {
  it('opens the matching panel for each object', () => {
    expect(targetAction('head', false)).toEqual({ kind: 'tab', tab: 'talk' });
    expect(targetAction('body', false)).toEqual({ kind: 'tab', tab: 'exam' });
    expect(targetAction('iv', false)).toEqual({ kind: 'tab', tab: 'treat' });
    expect(targetAction('oxygen', false)).toEqual({ kind: 'tab', tab: 'treat' });
    expect(targetAction('monitor', false)).toEqual({ kind: 'scroll', to: 'monitor' });
  });

  it('sends the crash trolley to the ALS panel in arrest', () => {
    expect(targetAction('cart', false)).toEqual({ kind: 'tab', tab: 'treat' });
    expect(targetAction('cart', true)).toEqual({ kind: 'scroll', to: 'als' });
  });

  it('has an action for every target', () => {
    for (const t of BAY_TARGETS) expect(targetAction(t, false).kind).toMatch(/tab|scroll/);
  });
});

describe('3D bay state', () => {
  it('maps devices to the oxygen shown on the face', () => {
    expect(oxygenKind([])).toBeNull();
    expect(oxygenKind(['o2_nrb'])).toBe('mask');
    expect(oxygenKind(['o2_venturi'])).toBe('mask');
    expect(oxygenKind(['o2_nasal'])).toBe('nasal');
    expect(oxygenKind(['o2_nrb', 'bvm'])).toBe('bvm');
  });

  it('shows lines, drips, pads and posture from the engine status', () => {
    const calm = bayStateOf(STATUS, {}, { gcs: 15, rr: 16 }, true);
    expect(calm).toMatchObject({ reclined: true, eyesClosed: false, drip: false, padsOn: false });
    expect(calm.rr).toBe(16);
    const busy = bayStateOf(
      {
        ...STATUS,
        devices: ['defib_pads', 'o2_nrb'],
        access: { iv: true, io: false, art: false },
        fluidsRunning: [{ fluidId: 'crystalloid', pendingMl: 300 }],
      },
      {},
      { gcs: 15, rr: 20 },
      true,
    );
    expect(busy).toMatchObject({ padsOn: true, oxygen: 'mask', ivAccess: true, drip: true });
  });

  it('lies flat with eyes closed when barely conscious or in arrest', () => {
    expect(bayStateOf(STATUS, {}, { gcs: 7, rr: 8 }, true)).toMatchObject({
      reclined: false,
      eyesClosed: true,
    });
    const arrest = bayStateOf({ ...STATUS, arrest: true, cpr: true }, {}, { gcs: 3, rr: 0 }, true);
    expect(arrest).toMatchObject({ reclined: false, eyesClosed: true, cpr: true, rr: 0 });
  });

  it('does not breathe before the case starts', () => {
    expect(bayStateOf(STATUS, {}, { gcs: 15, rr: 18 }, false).rr).toBe(0);
  });
});

describe('skin colour', () => {
  it('mixes colours channel by channel', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x102030, 0x102030, 0.7)).toBe(0x102030);
    expect(mix(0x000000, 0xff0000, 2)).toBe(0xff0000);
  });

  it('turns bluer with cyanosis and redder with flushing', () => {
    const base = skinColour({}, false);
    const blue = skinColour({ cyanosis: 1 }, false);
    const red = skinColour({ flush: 1 }, false);
    expect(channel(blue, 0)).toBeGreaterThan(channel(base, 0));
    expect(channel(blue, 16)).toBeLessThan(channel(base, 16));
    expect(channel(red, 8)).toBeLessThan(channel(base, 8));
    expect(skinColour({ cyanosis: 1 }, true)).toBe(skinColour({}, true));
  });
});

describe('breathing and compressions', () => {
  it('rises once per breath and rests between breaths', () => {
    expect(breathScale(0, 15, false)).toBeCloseTo(1);
    expect(breathScale(2, 15, false)).toBeCloseTo(1.035);
    expect(breathScale(4, 15, false)).toBeCloseTo(1);
    expect(breathScale(3, 0, false)).toBe(1);
  });

  it('compresses the chest during CPR', () => {
    const quarter = 60 / CPR_RATE / 4;
    expect(breathScale(quarter, 0, true)).toBeCloseTo(0.94);
    for (let t = 0; t < 3; t += 0.05) expect(breathScale(t, 0, true)).toBeLessThanOrEqual(1);
  });
});

describe('3D monitor screen', () => {
  function fakeCtx() {
    const text: string[] = [];
    const ctx = {
      fillStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
      fillRect: () => undefined,
      drawImage: () => undefined,
      fillText: (s: string) => text.push(s),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, text };
  }
  const vitals = {
    hr: 118.4,
    sbp: null,
    dbp: null,
    map: null,
    spo2: 93,
    rr: 24,
    etco2: 31,
    temp: 37,
    gcs: 15,
    glucose: 5,
    rhythm: 'sinus_tachy' as const,
    ectopy: false,
  };

  it('shows rounded numbers and the last cuff reading', () => {
    const { ctx, text } = fakeCtx();
    drawScreen(ctx, null, { vitals, nibp: { sbp: 84, dbp: 50, map: 61 }, live: true });
    expect(text).toEqual(expect.arrayContaining(['118', '93', '84/50', '24', '31']));
  });

  it('shows dashes before the case starts', () => {
    const { ctx, text } = fakeCtx();
    drawScreen(ctx, null, { vitals, nibp: null, live: false });
    expect(text.filter((t) => t.startsWith('--')).length).toBe(5);
  });
});

describe('view preference', () => {
  it('defaults to the 2D view', () => {
    expect(useSim.getState().bayView).toBe('2d');
  });
});
