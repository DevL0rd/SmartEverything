import { DRIVE_HEALTH, type DriveHealth } from '@smarteverything/domain';
import { percent } from '../../../format/number';
import { describe, expect, it } from 'vitest';
import { healthLinesOf, scrubViewOf } from './health-card';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');

function health(patch: Partial<Record<keyof DriveHealth, unknown>>): DriveHealth {
  return DRIVE_HEALTH.parse({
    hashedShare: 1,
    verifiedShare: 0.8,
    corrupt: 0,
    rootsTotal: 3,
    rootsUnavailable: 0,
    watcher: 'watching',
    space: { totalBytes: 1000, freeBytes: 400, fsType: 'ext4' },
    scrub: { state: 'idle', lastFinishedAt: '2026-11-04T12:00:00.000Z', corrupt: 0 },
    backup: { last: null, lastOkAt: null },
    ...patch,
  });
}

describe('Drive health', () => {
  it('rings the checked share after a clean scrub', () => {
    expect(scrubViewOf(health({}), NOW, {})).toEqual({
      title: 'Scrub · 3 d ago',
      detail: `${percent(0.8)} of files read back · nothing damaged or unreadable`,
      ring: 0.8,
      colour: 'positive',
    });
  });

  it('turns the ring critical when a scrub found damage', () => {
    const view = scrubViewOf(
      health({
        corrupt: 2,
        scrub: { state: 'idle', lastFinishedAt: '2026-11-07T11:00:00.000Z', corrupt: 2 },
      }),
      NOW,
      {},
    );
    expect(view.colour).toBe('critical');
    expect(view.detail).toContain('2 files damaged or unreadable');
  });

  it('follows a running scrub by files checked', () => {
    const view = scrubViewOf(
      health({
        scrub: {
          state: 'running',
          startedAt: '2026-11-07T11:00:00.000Z',
          checked: 25,
          total: 100,
          corrupt: 0,
        },
      }),
      NOW,
      {},
    );
    expect(view).toMatchObject({
      title: 'Scrubbing now',
      detail: 'Reading every file back from the disk',
      ring: 0.25,
      colour: 'info',
    });
  });

  it('follows the live scrub progress ahead of the last health answer', () => {
    const running = health({
      scrub: {
        state: 'running',
        startedAt: '2026-11-07T11:00:00.000Z',
        checked: 25,
        total: 100,
        corrupt: 0,
      },
    });
    const live = { root: { scrub: { done: 60, total: 100 } } };
    expect(scrubViewOf(running, NOW, live).ring).toBe(0.6);
  });

  it('keeps the stopped point of a stopped scrub', () => {
    const view = scrubViewOf(
      health({
        scrub: {
          state: 'stopped',
          startedAt: '2026-11-07T11:00:00.000Z',
          checked: 40,
          total: 100,
          corrupt: 1,
        },
      }),
      NOW,
      { root: { scrub: { done: 90, total: 100 } } },
    );
    expect(view).toMatchObject({
      title: `Scrub stopped at ${percent(0.4)}`,
      ring: 0.4,
      colour: 'warning',
    });
  });

  it('says the drives were never scrubbed', () => {
    const view = scrubViewOf(
      health({ verifiedShare: 0, scrub: { state: 'idle', lastFinishedAt: null, corrupt: 0 } }),
      NOW,
      {},
    );
    expect(view).toMatchObject({
      title: 'Never scrubbed',
      detail:
        'Reads every file back from the disk and checks it against its stored fingerprint, so damage on the disk is found',
      ring: 0,
      colour: 'track',
    });
  });

  it('lists damage, drives ready, the watcher and the last backup', () => {
    const lines = healthLinesOf(
      health({
        rootsUnavailable: 1,
        watcher: 'unavailable',
        backup: {
          last: { at: '2026-11-07T09:00:00.000Z', reporter: 'restic', bytes: 10, ok: false },
          lastOkAt: '2026-11-06T09:00:00.000Z',
        },
      }),
      NOW,
    );
    expect(lines.map((line) => [line.key, line.text, line.tone])).toEqual([
      ['damage', 'None found', 'variant'],
      ['drives', '2 of 3 ready · 1 not answering', 'warning'],
      ['watcher', 'Not watching · changes show after a rescan', 'warning'],
      ['backup', 'Failed 3 h ago · restic · last good one 1 d ago', 'critical'],
    ]);
  });

  it('says when no backup has reported yet', () => {
    const backup = healthLinesOf(health({}), NOW).find((line) => line.key === 'backup');
    expect(backup?.text).toBe('No backup reported yet');
  });
});
