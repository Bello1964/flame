import { describe, expect, it } from 'vitest';
import { changedFields, facilityFormSchema, flareSourceFormSchema, toApi } from './schemas';
import { safeRedirectPath } from '@/features/auth/safe-redirect';

const validFacility = {
  name: 'Okpai',
  code: 'OKP-1',
  description: '',
  region: '',
  country: 'ng',
  latitude: '',
  longitude: '',
  timeZone: 'Africa/Lagos',
};

describe('facility form schema', () => {
  it('accepts coordinates with up to 6 decimal places, kept as strings', () => {
    const values = facilityFormSchema.parse({
      ...validFacility,
      latitude: '5.123456',
      longitude: '-6.5',
    });
    expect(toApi.facility(values)).toMatchObject({
      latitude: '5.123456',
      longitude: '-6.5',
      country: 'NG',
    });
  });

  it.each([
    ['latitude', '5.1234567'],
    ['latitude', '91'],
    ['longitude', '-180.5'],
    ['latitude', 'abc'],
  ])('rejects %s %s', (field, value) => {
    expect(facilityFormSchema.safeParse({ ...validFacility, [field]: value }).success).toBe(false);
  });

  it('rejects codes the API would reject', () => {
    expect(facilityFormSchema.safeParse({ ...validFacility, code: '-bad' }).success).toBe(false);
    expect(facilityFormSchema.safeParse({ ...validFacility, code: 'a'.repeat(51) }).success).toBe(
      false,
    );
  });

  it('turns empty optional text into null, not an empty string', () => {
    expect(toApi.facility(facilityFormSchema.parse(validFacility))).toMatchObject({
      description: null,
      region: null,
      latitude: null,
      longitude: null,
    });
  });
});

describe('flare source form', () => {
  it('maps "not recorded" flare type to null', () => {
    const values = flareSourceFormSchema.parse({
      name: 'Stack 1',
      code: 'S1',
      flareType: 'NONE',
      description: '',
    });
    expect(toApi.flareSource(values).flareType).toBeNull();
  });
});

describe('changedFields', () => {
  it('keeps only dirty fields', () => {
    expect(changedFields({ name: 'A', code: 'B', region: null }, { region: true })).toEqual({
      region: null,
    });
  });
});

describe('safeRedirectPath', () => {
  it.each([
    [null, '/app'],
    ['/o/1/facilities?q=x', '/o/1/facilities?q=x'],
    ['//evil.example.com', '/app'],
    ['https://evil.example.com', '/app'],
    ['/\\evil.example.com', '/app'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
