import { describe, expect, it } from 'vitest';
import { placementWordsOf, sentenceOf, syncedShareOf, upgradeOf } from './placement-words';
import { bytes } from '../../../format/number';
import { GB, placement } from './placement-fixture';

describe('placement state words', () => {
  it('names every state with its chip and tone', () => {
    const cases = [
      [placement({ mode: 'synced' }), 'Up to date', 'positive'],
      [
        placement({ mode: 'synced' }, { state: 'syncing', needBytes: 6 * GB }),
        'Syncing 40 %',
        'info',
      ],
      [placement(), 'Mounted', 'positive'],
      [placement({}, { state: 'offline' }), 'Offline', 'neutral'],
      [placement({ enabled: false }), 'Paused', 'neutral'],
      [placement({}, { state: 'failed', reason: 'fuse3 is missing' }), 'Failed', 'critical'],
      [placement({ hold: 'no_access' }), 'On hold: no access', 'warning'],
    ] as const;
    for (const [row, chip, tone] of cases) {
      const words = placementWordsOf(row, 10 * GB);
      expect(words.chip.label.replace(/\u00a0/g, ' ')).toBe(chip);
      expect(words.chip.tone).toBe(tone);
    }
  });

  it('gives the reason of a failure and of a hold', () => {
    const failed = placementWordsOf(placement({}, { state: 'failed', reason: 'No space' }), null);
    expect(sentenceOf('mounted', failed)).toBe('Mount · No space');
    const held = placementWordsOf(placement({ hold: 'trashed' }), null);
    expect(held.held).toBe(true);
    expect(sentenceOf('synced', held)).toBe('The folder is in the trash. Restore it to carry on.');
  });

  it('says a view grant placement is read only and how a basic mount is limited', () => {
    const words = placementWordsOf(
      placement(
        {},
        {
          readOnly: true,
          tier: 'basic',
          basicLimits: { maxFileBytes: 50 * 1024 * 1024, wholeFileOpen: true, offline: false },
        },
      ),
      null,
    );
    expect(words.notes).toEqual([
      `Basic · ${bytes(50 * 1024 * 1024)} file limit · files open whole · not available offline`,
      'Read only: you can view this folder, not change it',
    ]);
  });

  it('measures how much of the folder is already here', () => {
    expect(syncedShareOf(25, 100)).toBe(0.75);
    expect(syncedShareOf(0, 0)).toBeNull();
    expect(syncedShareOf(10, null)).toBeNull();
  });

  it('offers the full mount only where basic limits apply', () => {
    expect(upgradeOf(null)).toBeNull();
    expect(upgradeOf({ maxFileBytes: 1, wholeFileOpen: false, offline: false })).toBe('winfsp');
    expect(upgradeOf({ maxFileBytes: null, wholeFileOpen: false, offline: false })).toBe('fuse3');
  });
});
