/**
 * Waveform shapes for the monitor, as pure functions of a beat or breath
 * phase in [0, 1). Morphologies follow the usual teaching rhythm-strip
 * appearance (see Infirmary Integrated for a fuller open-source set).
 */
const gauss = (p: number, c: number, w: number, a: number) =>
  a * Math.exp(-((p - c) ** 2) / (2 * w * w));

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface EcgOpts {
  /** ST elevation in units of R height (0 = none). */
  st?: number;
  /** No P wave (AF, SVT, junctional). */
  noP?: boolean;
  /** Broad ventricular complex (PVC, PEA, VT). */
  wide?: boolean;
}

/** Lead II complex; returns roughly −0.4 … 1 (R wave = 1). */
export function ecgBeat(p: number, o: EcgOpts = {}): number {
  if (o.wide) {
    return gauss(p, 0.3, 0.045, 0.95) + gauss(p, 0.4, 0.05, -0.45) + gauss(p, 0.62, 0.07, -0.3);
  }
  const pWave = o.noP ? 0 : gauss(p, 0.16, 0.025, 0.12);
  const st = o.st ? o.st * smoothstep(0.33, 0.37, p) * (1 - smoothstep(0.55, 0.68, p)) : 0;
  return (
    pWave +
    gauss(p, 0.28, 0.008, -0.12) +
    gauss(p, 0.31, 0.01, 1) +
    gauss(p, 0.34, 0.01, -0.28) +
    gauss(p, 0.58, 0.045, 0.25) +
    st
  );
}

/** Coarse ventricular fibrillation from a few incommensurate sines; t in seconds. */
export function vfWave(t: number): number {
  return 0.35 * Math.sin(t * 31) + 0.25 * Math.sin(t * 47 + 1) + 0.18 * Math.sin(t * 13 + 2);
}

/** Atrial fibrillation baseline wobble; t in seconds. */
export function fibrillatoryBaseline(t: number): number {
  return 0.03 * Math.sin(t * 38) + 0.02 * Math.sin(t * 57 + 0.7);
}

/** Pulse oximeter plethysmograph, 0 … ~1, lagging the ECG. */
export function plethShape(p: number): number {
  const q = (p - 0.36 + 1) % 1;
  return Math.exp(-((q - 0.15) ** 2) / 0.008) + 0.35 * Math.exp(-((q - 0.42) ** 2) / 0.006);
}

/** Arterial pressure as a fraction between diastolic (0) and systolic (1). */
export function artShape(p: number): number {
  const q = (p - 0.3 + 1) % 1;
  if (q < 0.12) return smoothstep(0, 0.12, q);
  const fall = 1 - 0.55 * smoothstep(0.12, 0.38, q);
  const notch =
    -0.08 * Math.exp(-((q - 0.4) ** 2) / 0.0008) + 0.06 * Math.exp(-((q - 0.45) ** 2) / 0.002);
  const runoff = (1 - smoothstep(0.42, 1, q)) * 0.45;
  return Math.max(0, q < 0.4 ? fall : runoff + notch);
}

/**
 * Capnogram, 0 … 1 of EtCO2, over one breath. `obstruction` 0–1 slows the
 * expiratory upstroke into the "shark fin" of bronchospasm.
 */
export function capnoShape(rp: number, obstruction = 0): number {
  const insp = 0.38;
  if (rp < insp) return 0;
  const riseEnd = insp + 0.05 + 0.3 * obstruction;
  if (rp < riseEnd) return 0.9 * smoothstep(insp, riseEnd, rp);
  if (rp < 0.95) return 0.9 + 0.1 * ((rp - riseEnd) / (0.95 - riseEnd));
  return 1 - smoothstep(0.95, 1, rp);
}
