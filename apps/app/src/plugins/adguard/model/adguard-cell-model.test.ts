import type { AdGuardFilter } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import { adguardCellOf, blockedPerMinute, liveBars } from './adguard-cell-model';
import { snapshotFixture, statusFixture } from './snapshot-fixture';

const NOW = Date.parse('2026-10-17T13:30:00.000Z');

describe('adguardCellOf', () => {
  it('protects: share blocked, lookups, top blocked and the hourly bars', () => {
    const cell = adguardCellOf(snapshotFixture(), NOW);
    expect(cell.kind).toBe('on');
    expect(cell.chip).toEqual({ tone: 'positive', label: 'Protecting' });
    expect(cell.line).toBe('18 % blocked · 30,604 lookups');
    expect(cell.figures).toEqual([{ value: '18', unit: '%', caption: 'blocked' }]);
    expect(cell.ratio).toBeCloseTo(0.184, 5);
    expect(cell.topBlocked.map((entry) => entry.name)).toEqual([
      'doubleclick.net',
      'ads.tiktok.com',
    ]);
    expect(cell.bars).toHaveLength(24);
    expect(cell.spoken).toBe('AdGuard Home, protecting, 18 % blocked · 30,604 lookups');
  });

  it('says when it resumes while paused and keeps the warning tone', () => {
    const until = '2026-10-17T14:30:00.000Z';
    const cell = adguardCellOf(
      snapshotFixture({ status: statusFixture({ protection: false, pausedUntil: until }) }),
      NOW,
    );
    expect(cell.kind).toBe('paused');
    expect(cell.chip).toEqual({ tone: 'warning', label: 'Paused' });
    expect(cell.line).toBe(`Paused · resumes ${clock(until)}`);
    expect(cell.tone).toBe('warning');
  });

  it('is critical and plain when blocking is off without a pause', () => {
    const cell = adguardCellOf(
      snapshotFixture({ status: statusFixture({ protection: false }) }),
      NOW,
    );
    expect(cell.kind).toBe('off');
    expect(cell.chip).toEqual({ tone: 'critical', label: 'Off' });
    expect(cell.line).toBe('Ad blocking is off');
  });

  it('keeps the totals out of the line when no stats came in yet', () => {
    const cell = adguardCellOf(snapshotFixture({ stats: null }), NOW);
    expect(cell.line).toBe('Ad blocking is on');
    expect(cell.figures).toEqual([]);
    expect(cell.ratio).toBeNull();
    expect(cell.bars).toEqual([]);
  });

  it('goes stale with the reason and no figures when AdGuard Home is unreachable', () => {
    const since = '2026-10-17T13:25:00.000Z';
    const cell = adguardCellOf(
      snapshotFixture({ connection: { state: 'unreachable', reason: 'timeout', since } }),
      NOW,
    );
    expect(cell.kind).toBe('stale');
    expect(cell.chip).toEqual({ tone: 'neutral', label: 'Not reachable' });
    expect(cell.reason).toContain('Can’t reach AdGuard Home');
    expect(cell.figures).toEqual([]);
  });

  it('asks for a sign-in when it was refused', () => {
    const cell = adguardCellOf(
      snapshotFixture({ connection: { state: 'refused', reason: 'bad' } }),
      NOW,
    );
    expect(cell.chip).toEqual({ tone: 'critical', label: 'Sign-in needed' });
  });

  it('counts enabled filter lists and their rules', () => {
    const filter = (id: number, enabled: boolean, rules: number): AdGuardFilter => ({
      id,
      name: `list ${String(id)}`,
      url: 'https://example.test',
      enabled,
      rules,
      updatedAt: null,
      allowList: false,
    });
    const cell = adguardCellOf(
      snapshotFixture({
        filters: [filter(1, true, 1_000_000), filter(2, true, 200_000), filter(3, false, 5)],
      }),
      NOW,
    );
    expect(cell.lists).toBe('2 lists · 1.2M rules');
  });
});

describe('live data', () => {
  it('turns the per-second blocked rate into a smoothed per-minute figure', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({
      t: index,
      v: index < 10 ? 100 : 0.2,
    }));
    expect(blockedPerMinute(points)).toBeCloseTo(12, 5);
    expect(blockedPerMinute([])).toBeNull();
  });

  it('splits each live lookup rate into allowed and blocked and keeps the latest 40', () => {
    const lookups = Array.from({ length: 50 }, (_, index) => ({ t: 1000 + index, v: 10 }));
    const blocked = lookups.map((point) => ({ t: point.t, v: 4 }));
    const bars = liveBars(lookups, blocked);
    expect(bars).toHaveLength(40);
    expect(bars[0]?.at).toBe(1010);
    expect(bars[0]).toMatchObject({ allowed: 6, blocked: 4, total: 10 });
  });

  it('never blocks more than was looked up', () => {
    const bars = liveBars([{ t: 1, v: 2 }], [{ t: 1, v: 5 }]);
    expect(bars[0]).toMatchObject({ allowed: 0, blocked: 2, total: 2 });
  });
});
