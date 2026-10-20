import type { BrushGattDump } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { privacyLine } from './privacy-line';
import {
  addressOf,
  bytesOf,
  findKey,
  identityOf,
  isSupported,
  ringHexOf,
  variantLine,
  verifyRows,
} from './dump-reading';

const HEARD = { address: 'a0:14:3d:11:22:33', advert: '08365208320000050001' } as const;

const FULL: Readonly<Record<string, string>> = {
  ff01: '3322113d14a0',
  ff02: '360852',
  ff04: '0300',
  ff05: '5bb004e40c00001c',
  ff07: '00',
  ff0a: '05',
  ff22: '00d4bf6b',
  ff25: '0001020304ffffff',
  ff26: '1e1e1e1e00000000',
  ff29: '0102030405',
  ff2b: '0f5bcc00',
  ff2d: '0017001405',
};

function without(key: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(FULL).filter(([name]) => name !== key));
}

function dumpOf(values: Readonly<Record<string, string | null>>): BrushGattDump {
  return {
    name: 'Oral-B Toothbrush',
    services: [
      {
        uuid: 'a0f0ff00-5047-4d53-8208-4f72616c2d42',
        characteristics: Object.entries(values).map(([key, value]) => ({
          uuid: `a0f0${key}-5047-4d53-8208-4f72616c2d42`.toUpperCase(),
          properties: ['read'],
          ...(value === null ? {} : { value }),
        })),
      },
    ],
  };
}

describe('reading a dump', () => {
  it('turns hex into bytes and finds a key by its short id in any case', () => {
    expect(bytesOf('5bff00')).toEqual([0x5b, 0xff, 0]);
    const dump = dumpOf(FULL);
    expect(findKey(dump, 'FF05')).toMatchObject({ present: true });
    expect(findKey(dump, 'ff05')).toMatchObject({ present: true });
    expect(findKey(dumpOf({}), 'ff05')).toEqual({ present: false });
  });

  it('reverses the six address bytes back to the advertised order', () => {
    expect(addressOf(findKey(dumpOf(FULL), 'ff01'))).toBe('A0:14:3D:11:22:33');
    expect(addressOf(findKey(dumpOf({ ff01: '0102' }), 'ff01'))).toBeNull();
    expect(addressOf({ present: false })).toBeNull();
  });
});

describe('the identity of a brush', () => {
  it('reads protocol, model and firmware from the brush itself', () => {
    const result = identityOf(HEARD, dumpOf(FULL));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity).toMatchObject({
        address: 'A0:14:3D:11:22:33',
        advertAddress: 'A0:14:3D:11:22:33',
        protocol: 8,
        modelId: 0x36,
        firmware: 82,
        gapName: 'Oral-B Toothbrush',
        ff05Length: 8,
        ff05Runtime: 1200,
        ff2bLength: 4,
        ff2dLength: 5,
        advertHex: '08365208320000050001',
      });
      expect(result.identity.present).toEqual([
        'FF05',
        'FF0A',
        'FF2B',
        'FF2D',
        'FF25',
        'FF26',
        'FF29',
      ]);
      expect(result.identity.clock).toBe(0x6bbfd400);
    }
  });

  it('falls back to the broadcast for the version when the brush does not report it', () => {
    const result = identityOf(HEARD, dumpOf(without('ff02')));
    expect(result.ok && result.identity).toMatchObject({
      protocol: 8,
      modelId: 0x36,
      firmware: 82,
    });
  });

  it('infers the force reading from the protocol when the characteristic exists', () => {
    const eight = identityOf(HEARD, dumpOf({ ...FULL, ff0b: '00' }));
    expect(eight.ok && eight.identity.ff0bLength).toBe(10);
    const six = identityOf(HEARD, dumpOf({ ...FULL, ff0b: '00', ff02: '360652' }));
    expect(six.ok && six.identity.ff0bLength).toBe(1);
    const none = identityOf(HEARD, dumpOf(FULL));
    expect(none.ok && none.identity.ff0bLength).toBeNull();
  });

  it('treats an unknown runtime as not available', () => {
    const result = identityOf(HEARD, dumpOf({ ...FULL, ff05: 'ffffff' }));
    expect(result.ok && result.identity.ff05Runtime).toBeNull();
  });

  it('refuses a brush that hides its address or reports a different one', () => {
    const hidden = identityOf(HEARD, dumpOf(without('ff01')));
    expect(hidden).toEqual({
      ok: false,
      reason: 'The brush did not report its Bluetooth address.',
    });
    const other = identityOf({ ...HEARD, address: 'A0:14:3D:AA:BB:CC' }, dumpOf(FULL));
    expect(other.ok).toBe(false);
    if (!other.ok) {
      expect(other.reason).toContain('does not match');
    }
  });
});

describe('the verify checklist', () => {
  it('shows what was read with real values', () => {
    const rows = new Map(verifyRows(HEARD, dumpOf(FULL)).map((row) => [row.key, row]));
    expect(rows.get('battery')?.value).toBe('91 percent');
    expect(rows.get('modes')?.value).toBe('Daily Clean, Sensitive, Gum Care, Whiten, Intense');
    expect(rows.get('pacer')?.value).toBe('4 × 30 + 30 + 30 + 30 s, 2:00 target');
    expect(rows.get('ring')?.value).toBe('Blue');
    expect(rows.get('head')?.value).toBe('23 days left');
    expect(rows.get('record')?.value).toBe('Read and decoded');
    expect(rows.get('clock')?.value).toBe('Read');
    expect(rows.get('address')?.state).toBe('read');
  });

  it('says not on this firmware instead of a green check', () => {
    const rows = verifyRows(
      HEARD,
      dumpOf(
        Object.fromEntries(
          Object.entries(FULL).filter(([name]) => !['ff05', 'ff2d', 'ff22', 'ff29'].includes(name)),
        ),
      ),
    );
    const missing = rows.filter((row) => row.state === 'missing');
    expect(missing.map((row) => row.key)).toEqual(['battery', 'head', 'record', 'clock']);
    for (const row of missing) {
      expect(row.value).toBe('Not on this firmware');
    }
  });

  it('reads only the header of a protocol 6 record and shows an off pacer', () => {
    const rows = new Map(
      verifyRows(HEARD, dumpOf({ ...FULL, ff02: '360652', ff26: '0000000000000000' })).map(
        (row) => [row.key, row],
      ),
    );
    expect(rows.get('record')?.value).toBe('Read, header only');
    expect(rows.get('pacer')?.value).toBe('Pacer off');
  });

  it('draws the ring colour that was read on the mini handle', () => {
    expect(ringHexOf(dumpOf(FULL))).toBe('#3870ff');
    expect(ringHexOf(dumpOf(without('ff2b')))).toBeNull();
  });
});

describe('the variant line', () => {
  it('describes what each protocol gives', () => {
    expect(variantLine(8)).toContain('Force, battery details');
    expect(variantLine(9)).toContain('Force, battery details');
    expect(variantLine(7)).toContain('read after brushing');
    expect(variantLine(6)).toContain('not decoded yet');
    expect(variantLine(3)).toContain('not an iO protocol');
    expect([6, 7, 8, 9].map(isSupported)).toEqual([true, true, true, true]);
    expect(isSupported(5)).toBe(false);
  });

  it('writes the privacy line with the person or without', () => {
    expect(privacyLine('Sam')).toBe('Only Sam and the owner see these sessions.');
    expect(privacyLine(null)).toContain('private to the owner');
  });
});
