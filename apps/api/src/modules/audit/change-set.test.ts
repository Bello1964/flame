import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { changeSet, onlyChanged, withStoredValues } from './change-set.js';

const existing = {
  name: 'Bonny Terminal',
  region: 'Rivers',
  latitude: new Prisma.Decimal('4.45321'),
  longitude: null,
  updatedAt: new Date('2026-11-15T10:00:00.000Z'),
};

describe('changeSet', () => {
  it('returns only fields whose value changes, as before/after', () => {
    expect(changeSet(existing, { name: 'Bonny', region: 'Rivers' })).toEqual({
      name: { before: 'Bonny Terminal', after: 'Bonny' },
    });
  });

  it('compares decimals by value, not by text', () => {
    expect(changeSet(existing, { latitude: '4.453210' })).toEqual({});
    expect(changeSet(existing, { latitude: '4.4533' })).toEqual({
      latitude: { before: '4.45321', after: '4.4533' },
    });
  });

  it('records clearing a value to null, and setting a previously empty one', () => {
    expect(changeSet(existing, { region: null, longitude: '7.1' })).toEqual({
      region: { before: 'Rivers', after: null },
      longitude: { before: null, after: '7.1' },
    });
  });

  it('ignores fields that were not provided', () => {
    expect(changeSet(existing, { name: undefined })).toEqual({});
  });

  it('serialises dates as ISO strings', () => {
    expect(changeSet(existing, { updatedAt: new Date('2026-11-16T00:00:00.000Z') })).toEqual({
      updatedAt: { before: '2026-11-15T10:00:00.000Z', after: '2026-11-16T00:00:00.000Z' },
    });
  });
});

describe('withStoredValues', () => {
  it('records the stored canonical value as after', () => {
    const changes = { longitude: { before: null, after: '7.100000' } };
    expect(withStoredValues(changes, { longitude: new Prisma.Decimal('7.1') })).toEqual({
      longitude: { before: null, after: '7.1' },
    });
  });
});

describe('onlyChanged', () => {
  it('keeps just the changed keys of the input', () => {
    const input = { name: 'Bonny', region: 'Rivers' };
    expect(onlyChanged(input, changeSet(existing, input))).toEqual({ name: 'Bonny' });
  });
});
