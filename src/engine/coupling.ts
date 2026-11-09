/**
 * Coupling between systems: turns baseline + summed effect offsets into a
 * consistent set of vitals, blood gases and signs.
 *
 *   baroreflex       HR rises as MAP falls below the patient's baseline MAP
 *   oxygenation      alveolar gas equation → V/Q gradient → Severinghaus
 *                    saturation curve → shunt mixing with venous blood
 *   ventilation      PaCO2 from RR and lost ventilation; EtCO2 from PaCO2,
 *                    perfusion and dead space
 *   consciousness    GCS from MAP, SpO2 and glucose
 *   kidneys          urine output from MAP
 */
import type { Baseline } from './caseTypes.ts';
import type { BaselineState, Signs } from './types.ts';

const P_ATM_KPA = 101.3;
const P_H2O_KPA = 6.3;
const RQ = 0.8;
const KPA_TO_MMHG = 7.50062;
export const AIR_FIO2 = 0.21;

/** Teaching parameters for the coupling model (flagged in docs/clinical-review.md). */
export const COUPLING = {
  baroGain: 0.6,
  baroMaxHr: 60,
  defaultPaco2: 5.3,
  rrVentExponent: 0.5,
  defaultShunt: 0.01,
  defaultVq: 0,
  defaultSvo2: 0.72,
  svo2PerMapDeficit: 0.005,
  gcsMapFloor: 55,
  gcsPerMapPoint: 1 / 3.5,
  gcsSpo2Floor: 85,
  hypoGlucose: 3,
  lactatePerMapDeficit: 0.05,
  urinePerMapPoint: 1.4,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const mapOf = (sbp: number, dbp: number) => dbp + (sbp - dbp) / 3;

/** Severinghaus (1979) oxyhaemoglobin dissociation curve; P in mmHg, returns 0–1. */
export function severinghaus(pMmHg: number): number {
  const p = Math.max(0.1, pMmHg);
  return 1 / (23400 / (p * p * p + 150 * p) + 1);
}

/** Inverse of severinghaus() by bisection; returns mmHg. */
export function inverseSeveringhaus(sat: number): number {
  let lo = 0.1;
  let hi = 700;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (severinghaus(mid) < sat) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface PhysInput {
  baseline: Baseline;
  /** Jittered per-patient baseline. */
  base: BaselineState;
  labs: Readonly<Record<string, number>>;
  /** Summed offsets from processes, drugs, fluids, devices and transients. */
  d: Readonly<Record<string, number>>;
  fio2: number;
  noise: Readonly<Record<string, number>>;
  weightKg: number;
}

export interface PhysOutput {
  hr: number;
  sbp: number;
  dbp: number;
  map: number;
  spo2: number;
  rr: number;
  etco2: number;
  temp: number;
  gcs: number;
  glucose: number;
  labs: Record<string, number>;
  signs: Signs;
}

export function physiology(i: PhysInput): PhysOutput {
  const { base, d, noise, baseline } = i;
  const g = (k: string) => d[k] ?? 0;
  const n = (k: string) => noise[k] ?? 0;
  const ratio = base.dbp / base.sbp;
  const baseMap = mapOf(base.sbp, base.dbp);

  // Circulation
  let sbp = base.sbp + g('sbp') + n('sbp');
  let dbp = base.dbp + g('dbp') + (g('sbp') + n('sbp')) * ratio;
  sbp = Math.max(25, sbp);
  dbp = clamp(dbp, 15, sbp - 8);
  const map = mapOf(sbp, dbp);
  const mapDeficit = Math.max(0, baseMap - map);
  const baro = Math.min(COUPLING.baroMaxHr, COUPLING.baroGain * mapDeficit);
  const hr = clamp(base.hr + g('hr') + baro + n('hr'), 20, 230);

  // Ventilation
  // Assisted ventilation (BVM, ventilator) sets a floor on RR and replaces lost ventilation.
  const rr = Math.max(4, g('_minRr'), base.rr + g('rr') + n('rr'));
  const ventLoss = clamp(g('ventLoss') - g('_ventSupport'), 0, 0.9);
  const paco2Base = baseline.paco2 ?? COUPLING.defaultPaco2;
  // Fast, shallow breathing raises alveolar ventilation less than RR alone suggests.
  const ventGain = Math.pow(base.rr / rr, COUPLING.rrVentExponent);
  const paco2 = clamp((paco2Base * ventGain) / (1 - ventLoss) + g('lab:paco2'), 2.5, 15);

  // Oxygenation
  const pAO2 = i.fio2 * (P_ATM_KPA - P_H2O_KPA) - paco2 / RQ;
  const vq = Math.max(0, (baseline.vq ?? COUPLING.defaultVq) + g('vq'));
  const pc = Math.max(1, pAO2 - vq);
  const shunt = clamp((baseline.shunt ?? COUPLING.defaultShunt) + g('shunt'), 0, 0.6);
  const svo2 = clamp(
    (baseline.svo2 ?? COUPLING.defaultSvo2) - COUPLING.svo2PerMapDeficit * mapDeficit,
    0.3,
    0.85,
  );
  const sao2 = (1 - shunt) * severinghaus(pc * KPA_TO_MMHG) + shunt * svo2;
  const spo2 = clamp(100 * sao2 + n('spo2'), 50, 100);
  const pao2 =
    sao2 < 0.97
      ? inverseSeveringhaus(sao2) / KPA_TO_MMHG
      : Math.max(inverseSeveringhaus(0.97) / KPA_TO_MMHG, pc * (1 - 2 * shunt));

  const etco2 = Math.max(
    0,
    paco2 * KPA_TO_MMHG - (3 + 0.15 * mapDeficit + 12 * ventLoss) + g('etco2') + n('etco2'),
  );

  // Metabolic
  const temp = baseline.temp + g('temp');
  const glucose = Math.max(0.5, baseline.glucose + g('glucose'));
  const lactate0 = i.labs['lactate'] ?? 1;
  const lactate = Math.max(
    0.3,
    lactate0 + g('lab:lactate') + COUPLING.lactatePerMapDeficit * Math.max(0, 65 - map),
  );
  const hco3 = (i.labs['hco3'] ?? 24) - 0.9 * (lactate - lactate0) + g('lab:hco3');
  const ph = 6.1 + Math.log10(Math.max(1, hco3) / (0.23 * paco2));

  // Consciousness
  const gcsDrop =
    Math.max(0, COUPLING.gcsMapFloor - map) * COUPLING.gcsPerMapPoint +
    Math.max(0, COUPLING.gcsSpo2Floor - spo2) / 3 +
    (glucose < COUPLING.hypoGlucose ? (COUPLING.hypoGlucose - glucose) * 3 : 0) -
    g('gcs');
  const gcs = clamp(Math.round(15 - gcsDrop), 3, 15);

  const urine = clamp((map - 50) * COUPLING.urinePerMapPoint, 0, 150) * (i.weightKg / 70);

  const labs: Record<string, number> = { ...i.labs };
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('lab:')) {
      const key = k.slice(4);
      labs[key] = (labs[key] ?? 0) + v;
    }
  }
  Object.assign(labs, { pao2, paco2, ph, hco3, lactate, glucose, urine, fio2: i.fio2, sao2 });

  const signs: Signs = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('sign:')) signs[k.slice(5)] = clamp(v, 0, 1);
  }
  signs['cyanosis'] = clamp((92 - spo2) / 20, 0, 1);
  signs['sweating'] = Math.max(signs['sweating'] ?? 0, clamp((mapDeficit - 15) / 30, 0, 1));
  signs['effort'] = Math.max(signs['effort'] ?? 0, clamp((rr - 20) / 20 + ventLoss, 0, 1));
  signs['eyesClosed'] = gcs < 12 ? 1 : 0;

  return { hr, sbp, dbp, map, spo2, rr, etco2, temp, gcs, glucose, labs, signs };
}
