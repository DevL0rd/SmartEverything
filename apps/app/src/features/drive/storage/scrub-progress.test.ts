import { describe, expect, it } from 'vitest';
import type { DriveScrubState } from '@smarteverything/domain';
import {
  damagedText,
  liveScrubCountsOf,
  scrubCountLineOf,
  scrubCountsOf,
  scrubSegmentsOf,
  scrubShareOf,
  type ScrubPass,
} from './scrub-progress';

const ANA = '00000000-0000-4000-8000-000000000301';
const BEN = '00000000-0000-4000-8000-000000000302';

const RUNNING: Extract<DriveScrubState, { readonly state: 'running' }> = {
  state: 'running',
  startedAt: '2026-11-07T11:00:00.000Z',
  checked: 100,
  total: 400,
  corrupt: 2,
};

const STOPPED: ScrubPass = { ...RUNNING, state: 'stopped' };

describe('scrub progress', () => {
  it('adds live scrub progress across library folders', () => {
    expect(liveScrubCountsOf({})).toBeNull();
    expect(liveScrubCountsOf({ [ANA]: { scan: { done: 0, total: 10 } } })).toBeNull();
    expect(
      liveScrubCountsOf({
        [ANA]: { scrub: { done: 1, total: 4 }, scan: { done: 0, total: 10 } },
        [BEN]: { scrub: { done: 3, total: 4 } },
      }),
    ).toEqual({ checked: 4, total: 8 });
  });

  it('prefers live progress while running and keeps the stopped point when stopped', () => {
    const live = { [ANA]: { scrub: { done: 300, total: 400 } } };
    expect(scrubCountsOf(RUNNING, live)).toEqual({ checked: 300, total: 400, corrupt: 2 });
    expect(scrubCountsOf(RUNNING, {})).toEqual({ checked: 100, total: 400, corrupt: 2 });
    expect(scrubCountsOf(STOPPED, live)).toEqual({ checked: 100, total: 400, corrupt: 2 });
  });

  it('splits files read back into fine and damaged or unreadable', () => {
    const counts = scrubCountsOf(RUNNING, {});
    expect(scrubShareOf(counts)).toBe(0.25);
    expect(scrubShareOf({ checked: 0, total: 0, corrupt: 0 })).toBe(0);
    expect(scrubSegmentsOf(counts, true)).toEqual([
      { label: 'Read back fine', value: 98, colour: 'info' },
      { label: 'Damaged or unreadable', value: 2, colour: 'critical' },
    ]);
    expect(scrubSegmentsOf(counts, false)[0]?.colour).toBe('warning');
    expect(scrubCountLineOf(counts)).toBe(
      '100 of 400 files read back · 2 files damaged or unreadable',
    );
  });

  it('words damaged or unreadable files', () => {
    expect(damagedText(0)).toBe('nothing damaged or unreadable');
    expect(damagedText(1)).toBe('1 file damaged or unreadable');
    expect(damagedText(1200)).toContain('files damaged or unreadable');
  });
});
