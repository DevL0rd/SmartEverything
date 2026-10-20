import { describe, expect, it } from 'vitest';
import {
  OralbFrameError,
  UnsupportedOralbProtocol,
  decodeOralbClock,
  decodeOralbRecord,
  decodeOralbValue,
  hexToBytes,
  isOralbMetadata,
  recordWallTime,
} from '../../src';
import { records } from './fixtures';

const bytes = (hex: string): Uint8Array => hexToBytes(hex);

describe('the protocol 8 retained session', () => {
  const fixture = records().protocol8;

  it.each([7, 8, 9])('decodes the 21 byte layout on protocol %i', (protocol) => {
    expect(decodeOralbRecord(bytes(fixture.hex), protocol)).toEqual({
      kind: 'session',
      protocol,
      startClock: fixture.startClock,
      sessionId: 353,
      userId: 0,
      targetS: 120,
      sectorCount: 0,
      durationS: 128,
      highPressureMs: 10000,
      lowPressureMs: 1000,
      averageForceMn: 1900,
      maximumForceMn: 3300,
      highPressureEvents: 40,
      lowPressureEvents: 2,
      powerOnEvents: 1,
      modeId: 4,
      batteryEnd: 94,
    });
  });

  it('reads the battery at the end as 94 percent', () => {
    const record = decodeOralbRecord(bytes(fixture.hex), 8);
    expect(record.kind === 'session' ? record.batteryEnd : null).toBe(94);
  });

  it('reads ff as an unknown battery', () => {
    const record = decodeOralbRecord(bytes(records().protocol8UnknownBattery), 8);
    expect(record.kind === 'session' ? record.batteryEnd : 'wrong').toBeNull();
  });

  it('splits the session id and the user id at bit 13', () => {
    const frame = bytes(fixture.hex);
    frame.set([0x05, 0x21], 4);
    const record = decodeOralbRecord(frame, 8);
    expect(record).toMatchObject({ sessionId: 0x0105, userId: 1 });
    frame.set([0xff, 0xff], 4);
    expect(decodeOralbRecord(frame, 8)).toMatchObject({ sessionId: 0x1fff, userId: 7 });
  });

  it('splits the target and the sector count at bit 13', () => {
    const frame = bytes(fixture.hex);
    frame.set([0x78, 0x80], 6);
    expect(decodeOralbRecord(frame, 8)).toMatchObject({ targetS: 120, sectorCount: 4 });
    frame.set([0xff, 0xff], 6);
    expect(decodeOralbRecord(frame, 8)).toMatchObject({ targetS: 0x1fff, sectorCount: 7 });
  });

  it('throws for fewer than 21 bytes', () => {
    for (const length of [0, 8, 19, 20]) {
      expect(() => decodeOralbRecord(bytes(fixture.hex).subarray(0, length), 8)).toThrow(
        OralbFrameError,
      );
    }
  });

  it('accepts more than 21 bytes', () => {
    const longer = new Uint8Array([...bytes(fixture.hex), 1, 2]);
    expect(decodeOralbRecord(longer, 8)).toMatchObject({ batteryEnd: 94 });
  });

  it('dates the record from a clock read in the same connection', () => {
    const readAt = Date.UTC(2026, 6, 31, 23, 0, 0);
    const wall = recordWallTime(fixture.startClock, fixture.clockRead, readAt);
    expect(new Date(wall).toISOString()).toBe('2026-07-31T22:54:00.000Z');
  });

  it('dates the record from an FF22 read without assuming an epoch', () => {
    const clock = decodeOralbClock(bytes('26e4ff31')).clock ?? 0;
    expect(recordWallTime(clock, clock, 5_000)).toBe(5_000);
    expect(recordWallTime(clock - 10, clock, 20_000)).toBe(10_000);
    expect(recordWallTime(clock, clock + 1, 20_000)).toBe(19_000);
  });
});

describe('the protocol 6 samples', () => {
  it.each(records().protocol6)(
    'decodes the header of sample $name and keeps the body raw',
    (sample) => {
      const record = decodeOralbRecord(bytes(sample.hex), 6);
      expect(record).toEqual({
        kind: 'header',
        protocol: 6,
        startClock: sample.startClock,
        sessionId: sample.sessionId,
        userId: sample.userId,
        targetS: sample.targetS,
        sectorCount: sample.sectorCount,
        bodyHex: sample.hex.slice(16),
      });
    },
  );

  it('reads ids 1023 and 1024 with a 120 second target and 4 sectors', () => {
    const [a, b] = records().protocol6.map((sample) => decodeOralbRecord(bytes(sample.hex), 6));
    expect(a).toMatchObject({ sessionId: 1023, targetS: 120, sectorCount: 4 });
    expect(b).toMatchObject({ sessionId: 1024, targetS: 120, sectorCount: 4 });
  });

  it('throws for a header shorter than eight bytes', () => {
    expect(() => decodeOralbRecord(bytes('ae4a3a32ff0378'), 6)).toThrow(OralbFrameError);
  });

  it('accepts a header without a body', () => {
    expect(decodeOralbRecord(bytes('ae4a3a32ff037880'), 6)).toMatchObject({ bodyHex: '' });
  });
});

describe('the metadata reply left in FF29', () => {
  const fixture = records().metadata;

  it.each([6, 7, 8, 9])('is classified metadata and never a session on protocol %i', (protocol) => {
    expect(decodeOralbRecord(bytes(fixture.hex), protocol)).toEqual({
      kind: 'metadata',
      model: fixture.model,
      colour: fixture.colour,
      language: fixture.language,
      modeSlots: fixture.modeSlots,
      gumGuard: 6,
    });
  });

  it('has no gum guard when the reply stops after the mode slots', () => {
    const short = bytes(fixture.hex).subarray(0, 12);
    expect(decodeOralbRecord(short, 8)).toMatchObject({ kind: 'metadata', gumGuard: null });
  });

  it('matches the shape only with the magic byte and known codes', () => {
    const base = bytes(fixture.hex);
    const change = (index: number, value: number): Uint8Array => {
      const copy = Uint8Array.from(base);
      copy[index] = value;
      return copy;
    };
    expect(isOralbMetadata(base)).toBe(true);
    expect(isOralbMetadata(change(0, 0xfe))).toBe(false);
    expect(isOralbMetadata(change(1, 7))).toBe(false);
    expect(isOralbMetadata(change(1, 17))).toBe(true);
    expect(isOralbMetadata(change(1, 16))).toBe(true);
    expect(isOralbMetadata(change(1, 0))).toBe(true);
    expect(isOralbMetadata(change(1, 6))).toBe(true);
    expect(isOralbMetadata(change(1, 18))).toBe(false);
    expect(isOralbMetadata(change(2, 16))).toBe(true);
    expect(isOralbMetadata(change(2, 17))).toBe(false);
    expect(isOralbMetadata(change(3, 10))).toBe(true);
    expect(isOralbMetadata(change(3, 11))).toBe(false);
    expect(isOralbMetadata(base.subarray(0, 11))).toBe(false);
    expect(isOralbMetadata(base.subarray(0, 12))).toBe(true);
  });

  it('does not take a session that merely starts with ff for metadata', () => {
    const frame = bytes(records().protocol8.hex);
    frame[0] = 0xff;
    frame[1] = 0xe4;
    expect(decodeOralbRecord(frame, 8).kind).toBe('session');
  });
});

describe('the protocol gate', () => {
  it.each([0, 1, 5, 10, 255])('refuses protocol %i', (protocol) => {
    const attempt = (): unknown => decodeOralbRecord(bytes(records().protocol8.hex), protocol);
    expect(attempt).toThrow(UnsupportedOralbProtocol);
  });

  it('is applied before the metadata check', () => {
    expect(() => decodeOralbRecord(bytes(records().metadata.hex), 5)).toThrow(
      UnsupportedOralbProtocol,
    );
  });

  it('flows through the dispatcher', () => {
    const delta = decodeOralbValue('ff29', bytes(records().protocol6[0]?.hex ?? ''), 6);
    expect(delta?.record).toMatchObject({ kind: 'header' });
  });
});
