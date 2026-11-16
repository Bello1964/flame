import { describe, expect, it } from 'vitest';
import { formatDecimal } from './format';

describe('formatDecimal', () => {
  it('rounds for display without trailing zeros', () => {
    expect(formatDecimal('0.12500000000000000000')).toBe('0.125');
    expect(formatDecimal('1234.5')).toBe('1,234.5');
  });

  it('never shows a non-zero value as 0', () => {
    expect(formatDecimal('0.00000001')).toBe('< 0.000001');
    expect(formatDecimal('0')).toBe('0');
  });
});
