import { describe, expect, it } from 'vitest';
import {
  clockIsUnix,
  decodeClassic,
  decodeStoredRecord,
  hexToBytes,
  recordStart,
  resolveMode,
} from '../../src';
import { storedSession } from './fixtures';

describe('the stored routine record of a Prestige HX999X', () => {
  const fixture = storedSession();
  const record = decodeStoredRecord(hexToBytes(fixture.stored_session.routine_record), 'notified');

  it('matches what the live values said about the same session', () => {
    expect(record).toMatchObject({
      sessionId: 335,
      durationS: fixture.live.brushing_time_peak_seconds,
      routineS: 160,
      intensity: 0,
      routineId: 1,
      handleClock: 0x0006ea6a,
    });
  });

  it('names the white plus mode from the routine id it carries', () => {
    expect(record).not.toBeNull();
    expect(
      resolveMode({
        selectsById: true,
        routineId: record?.routineId ?? null,
        position: record?.modePosition ?? null,
        routineIds: null,
        model: 'HX999X',
      }),
    ).toBe('white_plus');
  });

  it('reads the transfer header the handle announces', () => {
    expect(
      decodeClassic('40e0', hexToBytes(fixture.stored_session.transfer_header)).transfer,
    ).toStrictEqual({ sessionId: 335, length: 15 });
  });
});

describe('other record shapes', () => {
  it('reads the shorter record that stops at the intensity', () => {
    const record = decodeStoredRecord(hexToBytes('006aea06004f01a000a0000001'), 'notified');
    expect(record).toMatchObject({ modePosition: 0, intensity: 1, routineId: null });
  });

  it('reads the Kids form that is exactly sixteen bytes with no chunk byte', () => {
    const record = decodeStoredRecord(hexToBytes('11c260011e01780078000002000000ff'), 'read');
    expect(record).toMatchObject({
      sessionId: 286,
      durationS: 120,
      routineS: 120,
      modePosition: 0,
    });
    expect(decodeStoredRecord(hexToBytes('11c260011e01780078000002'), 'read')).toBeNull();
  });

  it('refuses a record that does not read as a session', () => {
    expect(decodeStoredRecord(hexToBytes('00000000000000000000000000000000'), 'read')).toBeNull();
    expect(decodeStoredRecord(hexToBytes('00ffffffff010078000100000000'), 'notified')).toBeNull();
    expect(decodeStoredRecord(hexToBytes('0000'), 'notified')).toBeNull();
    expect(decodeStoredRecord(hexToBytes('006aea06004f01a000180000000100'), 'notified')).toBeNull();
  });
});

describe('dating a stored session', () => {
  const now = new Date('2026-10-18T10:00:00.000Z');

  it('uses the clock directly when the Philips app has set it to Unix time', () => {
    expect(clockIsUnix(0x6a4fd034)).toBe(true);
    expect(clockIsUnix(5_913_072)).toBe(false);
    const start = recordStart({ handleClock: 1_783_615_540 }, 1_783_615_900, now);
    expect(start.toISOString()).toBe('2026-07-09T16:45:40.000Z');
  });

  it('anchors a counting clock on the current reading', () => {
    const start = recordStart({ handleClock: 5_913_072 }, 5_913_672, now);
    expect(start.toISOString()).toBe('2026-10-18T09:50:00.000Z');
  });
});
