/**
 * What the 3D bay shows and what clicking each object does. Pure functions
 * with no three.js, so they can be unit-tested and reused by any renderer.
 */
import type { EngineStatus } from '../../engine/engine.ts';
import type { Signs, Vitals } from '../../engine/types.ts';
import type { PanelTab } from '../../app/store.ts';

export const BAY_TARGETS = ['head', 'body', 'monitor', 'iv', 'cart', 'oxygen'] as const;
export type BayTarget = (typeof BAY_TARGETS)[number];

/** Accessible names, also used for hover tooltips. */
export const TARGET_LABELS: Record<BayTarget, string> = {
  head: 'Talk to the patient',
  body: 'Examine the patient',
  monitor: 'Monitor',
  iv: 'Drip stand',
  cart: 'Crash trolley',
  oxygen: 'Oxygen outlet',
};

export type BayAction = { kind: 'tab'; tab: PanelTab } | { kind: 'scroll'; to: 'monitor' | 'als' };

export function targetAction(t: BayTarget, arrest: boolean): BayAction {
  switch (t) {
    case 'head':
      return { kind: 'tab', tab: 'talk' };
    case 'body':
      return { kind: 'tab', tab: 'exam' };
    case 'monitor':
      return { kind: 'scroll', to: 'monitor' };
    case 'cart':
      return arrest ? { kind: 'scroll', to: 'als' } : { kind: 'tab', tab: 'treat' };
    case 'iv':
    case 'oxygen':
      return { kind: 'tab', tab: 'treat' };
  }
}

export type OxygenKind = 'mask' | 'nasal' | 'bvm' | null;

export interface BayState {
  arrest: boolean;
  cpr: boolean;
  padsOn: boolean;
  oxygen: OxygenKind;
  ivAccess: boolean;
  /** Fluids or an infusion running. */
  drip: boolean;
  /** Sitting up at about 30°; flat in arrest or when barely conscious. */
  reclined: boolean;
  eyesClosed: boolean;
  /** Skin colour as 0xRRGGBB. */
  skin: number;
  rr: number;
}

export function oxygenKind(devices: readonly string[]): OxygenKind {
  if (devices.includes('bvm')) return 'bvm';
  if (devices.some((d) => d.startsWith('o2_nasal'))) return 'nasal';
  if (devices.some((d) => d.startsWith('o2_'))) return 'mask';
  return null;
}

export function bayStateOf(
  status: EngineStatus,
  signs: Signs,
  vitals: Pick<Vitals, 'gcs' | 'rr'>,
  running: boolean,
): BayState {
  const drowsy = vitals.gcs <= 8;
  return {
    arrest: status.arrest,
    cpr: status.cpr,
    padsOn: status.devices.includes('defib_pads'),
    oxygen: oxygenKind(status.devices),
    ivAccess: status.access.iv || status.access.io,
    drip: status.fluidsRunning.length > 0 || status.infusions.length > 0,
    reclined: !status.arrest && !drowsy,
    eyesClosed: status.arrest || drowsy,
    skin: skinColour(running ? signs : {}, status.arrest),
    rr: running && !status.arrest ? vitals.rr : 0,
  };
}

const BASE_SKIN = 0xc99169;
const TINTS: { sign: string; colour: number; gain: number }[] = [
  { sign: 'flush', colour: 0xe0675a, gain: 0.55 },
  { sign: 'hives', colour: 0xd8524a, gain: 0.25 },
  { sign: 'pallor', colour: 0xe6d8c6, gain: 0.6 },
  { sign: 'cyanosis', colour: 0x8a8fb4, gain: 0.75 },
];
const ARREST_SKIN = 0x9a9aa8;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function mix(a: number, b: number, k: number): number {
  const t = clamp01(k);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

export function skinColour(signs: Signs, arrest: boolean): number {
  if (arrest) return mix(BASE_SKIN, ARREST_SKIN, 0.75);
  let c = BASE_SKIN;
  for (const t of TINTS) c = mix(c, t.colour, (signs[t.sign] ?? 0) * t.gain);
  return c;
}

/** Compressions per minute shown during CPR. */
export const CPR_RATE = 110;

/**
 * Chest size relative to rest at time tSec: rises with each breath, or is
 * pushed down by chest compressions during CPR.
 */
export function breathScale(tSec: number, rr: number, cpr: boolean): number {
  if (cpr) return 1 - 0.06 * Math.max(0, Math.sin((2 * Math.PI * CPR_RATE * tSec) / 60));
  if (rr <= 0) return 1;
  return 1 + 0.035 * (0.5 - 0.5 * Math.cos((2 * Math.PI * rr * tSec) / 60));
}
