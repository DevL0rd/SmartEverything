import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeLogPage, hexToBytes, nextLogCursor, scanLogPage } from '../../src';
import { TOF_LOG_RESPONSE } from './vectors';
import { concatBytes, emptySuccess, encodeMessage, encodeVarint, responseFrame } from './frames';

function pageOf(stamps: readonly number[]): Uint8Array {
  return responseFrame(
    1,
    'RequestGetCapFaultLog',
    concatBytes(
      ...stamps.map((stamp) =>
        encodeMessage(1, concatBytes(encodeVarint(1, stamp), encodeVarint(2, 1))),
      ),
    ),
  );
}

describe('LARQ log paging', () => {
  it('finds the newest timestamp on a page of the recorded distance log', () => {
    expect(scanLogPage(hexToBytes(TOF_LOG_RESPONSE), 'tof')).toStrictEqual({
      items: 2,
      lastTimestamp: 1_790_000_200,
    });
  });

  it('continues from the newest timestamp when the page was full', () => {
    const scan = scanLogPage(hexToBytes(TOF_LOG_RESPONSE), 'tof');
    expect(nextLogCursor(1_790_000_000, 2, scan)).toBe(1_790_000_200);
  });

  it('stops on a short page, an empty page and a page that does not advance', () => {
    const scan = scanLogPage(hexToBytes(TOF_LOG_RESPONSE), 'tof');
    expect(nextLogCursor(1_790_000_000, 5, scan)).toBeNull();
    expect(nextLogCursor(1_790_000_200, 2, scan)).toBeNull();
    expect(nextLogCursor(1_790_000_300, 2, scan)).toBeNull();
    expect(nextLogCursor(0, 5, scanLogPage(emptySuccess(2), 'tof'))).toBeNull();
  });

  it('takes the largest timestamp even when a page is out of order', () => {
    expect(scanLogPage(pageOf([30, 10, 20]), 'fault')).toStrictEqual({
      items: 3,
      lastTimestamp: 30,
    });
  });

  it('reads every row exactly once from a cap that serves ascending pages, then ends', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 1_000_000 }), { maxLength: 40 }),
        fc.integer({ min: 1, max: 10 }),
        (stamps, limit) => {
          const history = [...stamps].sort((left, right) => left - right);
          const collected: number[] = [];
          let from: number | null = 0;
          let requests = 0;
          while (from !== null) {
            const after: number = from;
            const page = history.filter((stamp) => stamp > after).slice(0, limit);
            collected.push(...decodeLogPage(pageOf(page), 'fault').map((row) => row.at));
            from = nextLogCursor(from, limit, scanLogPage(pageOf(page), 'fault'));
            requests += 1;
          }
          expect(collected).toStrictEqual(history);
          expect(requests).toBeLessThanOrEqual(Math.ceil(history.length / limit) + 1);
        },
      ),
    );
  });

  it('never loops: whatever a cap answers, the cursor only moves forward', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 10 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 10 }),
        (stamps, from, limit) => {
          const next = nextLogCursor(from, limit, scanLogPage(pageOf(stamps), 'fault'));
          expect(next === null || next > from).toBe(true);
        },
      ),
    );
  });
});
