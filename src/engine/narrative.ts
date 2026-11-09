/**
 * Resolves case text against the current state: severity bands for dialogue,
 * conditional exam findings and results, and {placeholder} templates.
 */
import type { Bands, TextVariant } from './caseTypes.ts';
import { evalCondition, type ConditionContext } from './conditions.ts';
import type { Vitals } from './types.ts';

/** Band index = number of cut-offs at or below the severity. */
export function bandFor(bands: Bands, severity: number): number {
  return bands.cutoffs.filter((c) => severity >= c).length;
}

export function pickVariant(variants: readonly TextVariant[], ctx: ConditionContext): string {
  for (const v of variants) if (!v.when || evalCondition(v.when, ctx)) return v.text;
  return '';
}

export type TemplateValues = Record<string, number | string | null>;

export function templateValues(
  vitals: Vitals,
  labs: Readonly<Record<string, number>>,
  o2Label: string,
): TemplateValues {
  const { ectopy: _ectopy, ...numeric } = vitals;
  return { ...labs, ...numeric, o2: o2Label };
}

/**
 * Replaces {key} with a rounded number and {key:2} with 2 decimal places.
 * Unknown keys stay visible as {key} so authoring mistakes are obvious.
 */
export function fillTemplate(text: string, values: TemplateValues): string {
  return text.replace(/\{([a-zA-Z0-9_]+)(?::(\d))?\}/g, (whole, key: string, dp?: string) => {
    const v = values[key];
    if (v === undefined) return whole;
    if (v === null) return '--';
    if (typeof v === 'string') return v;
    return dp ? v.toFixed(Number(dp)) : String(Math.round(v));
  });
}

/** Text in (round brackets) is the patient's body language rather than speech. */
export const isNonVerbal = (text: string) => text.startsWith('(');
