import type { Signs } from '../../engine/types.ts';

/** Plain-language description of what's visible, for screen readers. */
export function describeSigns(
  signs: Signs,
  arrest: boolean,
  name: string,
  possessive = 'their',
): string {
  if (arrest) return `${name} is unresponsive and not breathing.`;
  const s = (k: string) => signs[k] ?? 0;
  const bits: string[] = [];
  if (s('flush') > 0.12) bits.push('flushed');
  if (s('hives') > 0.3) bits.push('covered in raised hives');
  if (s('lipSwelling') > 0.3) bits.push('has swollen lips');
  if (s('cyanosis') > 0.2) bits.push('looks blue around the lips');
  if (s('sweating') > 0.3) bits.push('is pale and sweaty');
  if (s('effort') > 0.4) bits.push('is working hard to breathe');
  if (s('eyesClosed') > 0.5) bits.push(`has ${possessive} eyes closed and is drowsy`);
  if (!bits.length) return `${name} looks comfortable.`;
  return `${name} ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0]}.`;
}
