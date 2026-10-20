import { ORALB_PROBES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PROBE_TEXT,
  STATUS_WORD,
  brandRows,
  confirmText,
  identityRows,
  probeRows,
  recordLines,
  testsLine,
  type OralbDiagnostics,
} from './diagnostics-model';

const BRAND: OralbDiagnostics = {
  brand: 'oralb',
  identity: {
    address: 'A0:14:3D:11:22:33',
    advertAddress: 'A0:14:3D:11:22:33',
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    gapName: 'Oral-B Toothbrush',
    services: [],
    present: ['FF05', 'FF2B'],
    ff05Length: 8,
    ff05Runtime: null,
    ff0bLength: 10,
    ff2bLength: 4,
    ff2dLength: null,
    advertHex: '08365208320000050001',
    clock: null,
  },
  probes: { pacer_write: { passedAt: '2026-10-18T07:00:00.000Z', firmware: 82 } },
  forceBands: { lightBelow: 0.7, highAbove: 2.1, samples: 9 },
  headBaseline: { days: 90, seconds: 0, at: '2026-10-01T00:00:00.000Z' },
  advertIntervalMs: 1000,
  liveSource: 'link',
  filterRegistered: true,
  records: [
    { at: '2026-10-18T07:12:30.000Z', hex: '0102' },
    { at: '2026-10-18T07:13:30.000Z', hex: '0304' },
  ],
};

describe('the nine handle tests', () => {
  it('describes every test and what it writes', () => {
    expect(Object.keys(PROBE_TEXT).sort()).toEqual([...ORALB_PROBES].sort());
    for (const text of Object.values(PROBE_TEXT)) {
      expect(text.title).not.toBe('');
      expect(text.writes).toMatch(/^writes /);
    }
  });

  it('lists one row per test with the status and a run again once run', () => {
    const rows = probeRows(BRAND, 82);
    expect(rows).toHaveLength(9);
    expect(rows.find((row) => row.probe === 'pacer_write')).toMatchObject({
      status: 'passed',
      again: true,
    });
    expect(rows.find((row) => row.probe === 'ring_write')).toMatchObject({
      status: 'none',
      again: false,
    });
    expect(STATUS_WORD.none).toBe('Not run');
    expect(STATUS_WORD.passed).toBe('Passed');
    expect(testsLine(BRAND, 82)).toBe('Handle tests: 1 of 9 run');
  });

  it('asks before running and names the exact bytes', () => {
    expect(confirmText('history_select').body).toContain('02 01');
    expect(confirmText('metadata_select').body).toContain('05 FF');
    expect(confirmText('ring_write').body).toContain('FF2B');
    expect(confirmText('advert_log').body).toContain('sends nothing');
    expect(confirmText('pacer_write').body).toContain('Oral-B app must be closed');
  });
});

describe('the diagnostics rows', () => {
  it('shows identity with the model id in hex', () => {
    const rows = new Map(identityRows(BRAND));
    expect(rows.get('Protocol')).toBe('8');
    expect(rows.get('Model id')).toBe('0x36');
    expect(rows.get('Force reading')).toBe('10 bytes');
    expect(rows.get('Characteristics')).toBe('FF05, FF2B');
  });

  it('says what is not on the firmware', () => {
    const rows = new Map(
      identityRows({ ...BRAND, identity: { ...BRAND.identity, ff05Length: null, present: [] } }),
    );
    expect(rows.get('Battery reading')).toBe('Not on this firmware');
    expect(rows.get('Characteristics')).toBe('None read');
  });

  it('shows the brand rows and the raw records one per line', () => {
    const rows = new Map(brandRows(BRAND));
    expect(rows.get('Live source')).toBe('Connected');
    expect(rows.get('Pressure bands')).toBe('Learned from 9 readings');
    expect(rows.get('Head countdown start')).toBe('90 days');
    expect(recordLines(BRAND.records)).toBe('07:12:30  0102\n07:13:30  0304');
    const empty = new Map(
      brandRows({
        ...BRAND,
        forceBands: null,
        headBaseline: null,
        liveSource: null,
        advertIntervalMs: null,
      }),
    );
    expect(empty.get('Pressure bands')).toBe('Still learning');
    expect(empty.get('Live source')).toBe('None right now');
  });
});
