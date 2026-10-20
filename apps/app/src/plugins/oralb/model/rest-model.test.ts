import { describe, expect, it } from 'vitest';
import { MISSED_TEXT, PROTOCOL_SIX_CHIP, restNotes } from './rest-model';
import { moveSlot } from './slot-order';

const AT = (moment: string): string => moment.slice(11, 16);

describe('the notes at rest', () => {
  it('says sessions are recorded live on a protocol 6 handle only', () => {
    expect(restNotes(6, [], AT)).toEqual([PROTOCOL_SIX_CHIP]);
    expect(restNotes(8, [], AT)).toEqual([]);
    expect(restNotes(null, [], AT)).toEqual([]);
  });

  it('lists the latest sessions made away from the phone', () => {
    const missed = [
      { handleSessionId: 1, startedAt: '2026-10-16T07:12:00.000Z' },
      { handleSessionId: 2, startedAt: '2026-10-17T07:13:00.000Z' },
      { handleSessionId: 3, startedAt: '2026-10-18T07:14:00.000Z' },
    ];
    expect(restNotes(8, missed, AT)).toEqual([
      `Brushed at 07:13 away from your phone: ${MISSED_TEXT}`,
      `Brushed at 07:14 away from your phone: ${MISSED_TEXT}`,
    ]);
  });
});

describe('moving a mode slot', () => {
  it('swaps with the neighbour and keeps the rest', () => {
    expect(moveSlot(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveSlot(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list alone at an edge', () => {
    const slots = ['a', 'b'];
    expect(moveSlot(slots, 0, -1)).toBe(slots);
    expect(moveSlot(slots, 1, 1)).toBe(slots);
    expect(moveSlot(slots, 5, 1)).toBe(slots);
  });
});
