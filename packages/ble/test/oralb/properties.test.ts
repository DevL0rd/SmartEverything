import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ORALB_DECODED_KEYS,
  OralbFrameError,
  UnsupportedOralbProtocol,
  decodeOralbAdvert,
  decodeOralbRecord,
  decodeOralbValue,
  displayOfDrive,
  ringColourOf,
  recordWallTime,
} from '../../src';

const anyBytes = fc.uint8Array({ minLength: 0, maxLength: 40 });

function outcome(attempt: () => unknown): 'value' | 'frame' | 'protocol' {
  try {
    attempt();
    return 'value';
  } catch (error) {
    if (error instanceof OralbFrameError) {
      return 'frame';
    }
    if (error instanceof UnsupportedOralbProtocol) {
      return 'protocol';
    }
    throw error;
  }
}

describe('every decoder returns a value or throws its named error', () => {
  it('for any advert', () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        expect(['value', 'frame', 'protocol']).toContain(outcome(() => decodeOralbAdvert(bytes)));
      }),
    );
  });

  it('for any value of any decoded characteristic and any protocol', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ORALB_DECODED_KEYS),
        anyBytes,
        fc.option(fc.integer({ min: 0, max: 12 }), { nil: null }),
        (key, bytes, protocol) => {
          expect(['value', 'frame', 'protocol']).toContain(
            outcome(() => decodeOralbValue(key, bytes, protocol)),
          );
        },
      ),
    );
  });

  it('for any retained session on any protocol', () => {
    fc.assert(
      fc.property(anyBytes, fc.integer({ min: 0, max: 12 }), (bytes, protocol) => {
        expect(['value', 'frame', 'protocol']).toContain(
          outcome(() => decodeOralbRecord(bytes, protocol)),
        );
      }),
    );
  });

  it('and never throws for the characteristics it does not decode', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('ff0c', 'ff0d', 'ff0e', 'ff21', 'ff81'),
        anyBytes,
        (key, bytes) => {
          expect(decodeOralbValue(key, bytes, 8)).toBeNull();
        },
      ),
    );
  });
});

describe('invariants of the decoded values', () => {
  it('keeps a full length session inside its documented ranges', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 21, maxLength: 21 }),
        fc.constantFrom(7, 8, 9),
        (bytes, protocol) => {
          const record = decodeOralbRecord(bytes, protocol);
          if (record.kind !== 'session') {
            return;
          }
          expect(record.sessionId).toBeLessThanOrEqual(0x1fff);
          expect(record.userId).toBeLessThanOrEqual(7);
          expect(record.targetS).toBeLessThanOrEqual(0x1fff);
          expect(record.sectorCount).toBeLessThanOrEqual(7);
          expect(record.highPressureMs % 100).toBe(0);
          expect(record.averageForceMn % 100).toBe(0);
          expect(record.batteryEnd === null || record.batteryEnd <= 254).toBe(true);
        },
      ),
    );
  });

  it('keeps the display colour inside a byte and in step with the drive', () => {
    fc.assert(
      fc.property(fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255)), (drive) => {
        const display = displayOfDrive(drive);
        for (const [index, value] of display.entries()) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(255);
          expect(value).toBeGreaterThanOrEqual(Math.min(255, Math.floor(drive[index] ?? 0)));
        }
        expect(ringColourOf(drive).hex).toMatch(/^#[0-9A-F]{6}$/);
      }),
    );
  });

  it('makes the wall time of a record move one to one with the read time', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        fc.nat(),
        fc.nat(1_000_000),
        (start, elapsed, readAt, shift) => {
          const clock = start + elapsed;
          expect(
            recordWallTime(start, clock, readAt + shift) - recordWallTime(start, clock, readAt),
          ).toBe(shift);
          expect(recordWallTime(start, start, readAt)).toBe(readAt);
        },
      ),
    );
  });
});
