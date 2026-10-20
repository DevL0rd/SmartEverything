import { describe, expect, it } from 'vitest';
import type { AccessRequestRow } from '@smarteverything/domain';
import { GRANT_PRESETS, pendingFirst, requestStatusText, targetText, untilOf } from './requests';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');

const ROW: AccessRequestRow = {
  id: '00000000-0000-4000-8000-0000000000a1',
  profile_id: '00000000-0000-4000-8000-000000000001',
  kind: 'area',
  target: 'cameras',
  note: '',
  status: 'pending',
  until: null,
  requested_at: '2026-10-18T11:30:00.000Z',
  decided_at: null,
  lapsed_at: null,
  decided_by: null,
};

const NAMES = { places: new Map([['d1', 'Hall lamp']]) };

describe('targetText', () => {
  it('names the area, the device, the model and the extra budget in plain words', () => {
    expect(targetText(ROW, NAMES)).toBe('Cameras');
    expect(targetText({ kind: 'device', target: 'd1' }, NAMES)).toBe('Hall lamp');
    expect(targetText({ kind: 'device', target: 'gone' }, NAMES)).toBe('A device or room');
    expect(targetText({ kind: 'model', target: 'google/gemini' }, NAMES)).toBe('google/gemini');
    expect(targetText({ kind: 'budget', target: '5' }, NAMES)).toBe('$5 more AI budget');
    expect(targetText({ kind: 'budget', target: null }, NAMES)).toBe('More AI budget');
  });
});

describe('requestStatusText', () => {
  it('says when it was asked, denied, approved for good, approved for a while or ended', () => {
    expect(requestStatusText(ROW, NOW)).toBe('Asked 30 min ago');
    expect(
      requestStatusText({ ...ROW, status: 'denied', decided_at: '2026-10-18T11:55:00.000Z' }, NOW),
    ).toBe('Denied 5 min ago');
    expect(requestStatusText({ ...ROW, status: 'approved' }, NOW)).toBe('Approved for good');
    expect(
      requestStatusText({ ...ROW, status: 'approved', until: '2026-10-19T12:00:00.000Z' }, NOW),
    ).toBe('Approved, ends in 1 d');
    expect(
      requestStatusText(
        {
          ...ROW,
          status: 'approved',
          until: '2026-10-18T11:00:00.000Z',
          lapsed_at: '2026-10-18T11:00:00.000Z',
        },
        NOW,
      ),
    ).toBe('Ended 1 h ago');
  });
});

describe('grant presets', () => {
  it('give no end time for good and a future end time otherwise', () => {
    const [forever, day] = GRANT_PRESETS;
    expect(forever === undefined ? 'missing' : untilOf(forever, NOW)).toBeNull();
    expect(day === undefined ? 'missing' : untilOf(day, NOW)).toBe('2026-10-19T12:00:00.000Z');
  });
});

describe('pendingFirst', () => {
  it('puts the requests waiting for an answer before the decided ones', () => {
    const decided = { ...ROW, id: 'x', status: 'denied' } as const;
    expect(pendingFirst([decided, ROW]).map((row) => row.id)).toStrictEqual([ROW.id, 'x']);
  });
});
