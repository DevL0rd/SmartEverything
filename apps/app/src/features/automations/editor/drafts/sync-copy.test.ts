import { describe, expect, it } from 'vitest';
import {
  chipHint,
  chipLook,
  compareHeads,
  conflictCopy,
  noteHeading,
  noticeText,
  publishStatus,
} from './sync-copy';

describe('sync copy', () => {
  it('names each save state', () => {
    expect(chipLook({ status: 'saving' }).label).toBe('Saving…');
    expect(chipLook({ status: 'saved' }).label).toBe('Draft saved');
    expect(chipLook({ status: 'offline' }).label).toBe('Not saved');
  });

  it('explains offline and failed saves only', () => {
    expect(chipHint({ status: 'saved', failure: null })).toBeNull();
    expect(chipHint({ status: 'offline', failure: null })).toContain('Home Hub');
    expect(chipHint({ status: 'failed', failure: 'boom' })).toBe('boom');
  });

  it('words the conflict, the compare heads and the publish status', () => {
    const at = '2026-10-19T10:12:00.000Z';
    const now = Date.parse(at) + 60_000;
    expect(conflictCopy('The assistant', at, now, 'UTC').title).toMatch(
      /^The assistant changed this automation today /,
    );
    expect(conflictCopy('The assistant', at, now, 'UTC').caption).toBe(
      'Your draft has changes too. Nothing is lost.',
    );
    expect(
      compareHeads({ base: 7, by: 'The assistant', theirs: 8, savedAt: at, now, zone: 'UTC' }).mine,
    ).toBe('Your draft, based on version 7');
    expect(publishStatus(7, 8)).toBe(
      'No errors. Version 8 replaces version 7. It starts with the next trigger.',
    );
    expect(noteHeading(1)).toBe('1 thing to know');
    expect(noteHeading(2)).toBe('2 things to know');
  });

  it('lists what no longer fits after keeping the draft', () => {
    const text = noticeText({
      kept: 2,
      dropped: [{ op: { op: 'remove', key: 'b' }, summary: 'Remove "b"', reason: 'gone' }],
    });
    expect(text).toContain('2 of your changes');
    expect(text).toContain('Remove "b" (gone)');
  });
});
