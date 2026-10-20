import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LarqIdentityError, isLarqAdvert, serialOfName } from '../../src';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function nameOfSerial(serial: string): string {
  let value = BigInt(`0x${serial}`);
  let digits = '';
  while (digits.length < 11) {
    digits = `${BASE62.charAt(Number(value % 62n))}${digits}`;
    value /= 62n;
  }
  return `LARQ_${digits}`;
}

describe('LARQ cap identity', () => {
  it('turns the base 62 name into the sixteen digit serial', () => {
    expect(serialOfName('LARQ_00000000000')).toBe('0000000000000000');
    expect(serialOfName('LARQ_00000000001')).toBe('0000000000000001');
    expect(serialOfName('LARQ_0000000000A')).toBe('000000000000000A');
    expect(serialOfName('LARQ_0000000000z')).toBe('000000000000003D');
    expect(serialOfName('LARQ_00000000010')).toBe('000000000000003E');
  });

  it('round trips any 64-bit serial through its name', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 0xffff_ffff_ffff_ffffn }), (value) => {
        const serial = value.toString(16).toUpperCase().padStart(16, '0');
        expect(serialOfName(nameOfSerial(serial))).toBe(serial);
      }),
    );
  });

  it('refuses names that are not caps or do not fit in 64 bits', () => {
    expect(() => serialOfName('LARQ_short')).toThrow(LarqIdentityError);
    expect(() => serialOfName('larq_00000000001')).toThrow(LarqIdentityError);
    expect(() => serialOfName('LARQ_zzzzzzzzzzz')).toThrow(/64-bit/u);
  });

  it('recognises a cap by its name and the Device Information service', () => {
    const name = 'LARQ_00000000001';
    expect(isLarqAdvert({ name, serviceUuids: ['180a'] })).toBe(true);
    expect(isLarqAdvert({ name, serviceUuids: ['0000180A-0000-1000-8000-00805F9B34FB'] })).toBe(
      true,
    );
    expect(isLarqAdvert({ name, serviceUuids: ['180f'] })).toBe(false);
    expect(isLarqAdvert({ name, serviceUuids: ['0000180f-0000-1000-8000-00805f9b34fb'] })).toBe(
      false,
    );
    expect(isLarqAdvert({ name: 'LARQ_x', serviceUuids: ['180a'] })).toBe(false);
    expect(isLarqAdvert({ name: null, serviceUuids: ['180a'] })).toBe(false);
  });
});
