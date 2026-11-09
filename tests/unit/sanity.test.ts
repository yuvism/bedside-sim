import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from '../../src/app/Footer.tsx';

describe('scaffold', () => {
  it('carries the medical-safety disclaimer verbatim', () => {
    expect(DISCLAIMER).toBe(
      'Educational simulation. Simplified physiology. Not clinical guidance.',
    );
  });
});
