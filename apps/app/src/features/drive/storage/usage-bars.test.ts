import { DRIVE_USAGE, type DriveUsage } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { describe, expect, it } from 'vitest';
import {
  otherPersonTone,
  usageRowsOf,
  usageScaleOf,
  usageValueOf,
  type UsageNames,
} from './usage-bars';

const GB = 1024 ** 3;
const ME = '00000000-0000-4000-8000-0000000000a1';
const SAM = '00000000-0000-4000-8000-0000000000b1';
const ALEX = '00000000-0000-4000-8000-0000000000c1';
const KIM = '00000000-0000-4000-8000-0000000000d1';

const PEOPLE = new Map([
  [ME, 'Dana'],
  [SAM, 'Sam'],
  [ALEX, 'Alex'],
  [KIM, 'Kim'],
]);

const NAMES: UsageNames = { me: ME, personOf: (id) => PEOPLE.get(id) ?? null };

function usage(profileId: string | null, live: number): DriveUsage {
  return DRIVE_USAGE.parse({ profileId, live: live * GB, versions: GB, trash: 0 });
}

describe('Storage usage by person', () => {
  it('gives you blue, other people magenta steps and shared space the faint tone', () => {
    const rows = usageRowsOf(
      [usage(SAM, 400), usage(null, 900), usage(ME, 1100), usage(ALEX, 200), usage(KIM, 50)],
      null,
      NAMES,
    );
    expect(rows.map((row) => [row.name, row.tone.colour, row.tone.mix?.toward ?? null])).toEqual([
      ['You', 'viz-blue', null],
      ['Sam', 'viz-magenta', null],
      ['Alex', 'viz-magenta', 'on-surface'],
      ['Kim', 'viz-magenta', 'bg'],
      ['Shared with home', 'on-surface-faint', null],
    ]);
    expect(rows[2]?.tone.mix?.share).toBeCloseTo(0.45);
    expect(rows[3]?.tone.mix?.share).toBeCloseTo(0.45);
  });

  it('keeps every further person on a distinct, stronger magenta step', () => {
    const steps = [0, 1, 2, 3, 4, 5].map(otherPersonTone);
    const looks = steps.map((tone) => [tone.colour, tone.mix?.toward ?? null]);
    const shares = steps.map((tone) => tone.mix?.share ?? 0);
    expect(new Set(steps.map((tone) => JSON.stringify(tone))).size).toBe(steps.length);
    expect(looks).toEqual([
      ['viz-magenta', null],
      ['viz-magenta', 'on-surface'],
      ['viz-magenta', 'bg'],
      ['viz-magenta', 'on-surface'],
      ['viz-magenta', 'bg'],
      ['viz-magenta', 'on-surface'],
    ]);
    expect(shares[3]).toBeGreaterThan(shares[1] ?? 1);
    expect(shares[5]).toBeLessThan(1);
  });

  it('never uses the AI violet or automation green for people', () => {
    const rows = usageRowsOf([usage(SAM, 1), usage(ALEX, 2), usage(KIM, 3)], null, NAMES);
    expect(rows.map((row) => row.tone.colour)).not.toContain('viz-violet');
    expect(rows.map((row) => row.tone.colour)).not.toContain('viz-green');
  });

  it('orders other people by the space they use, including versions and trash', () => {
    const rows = usageRowsOf([usage(ALEX, 10), usage(SAM, 300)], null, NAMES);
    expect(rows.map((row) => [row.name, row.usedBytes])).toEqual([
      ['Sam', 301 * GB],
      ['Alex', 11 * GB],
    ]);
  });

  it('names someone the home no longer lists', () => {
    const rows = usageRowsOf([usage('00000000-0000-4000-8000-0000000000e1', 1)], null, NAMES);
    expect(rows[0]?.name).toBe('Someone');
  });

  it('puts every person on one scale that also fits each quota line', () => {
    const quotas = [{ profileId: SAM, bytes: 5000 * GB }];
    const rows = usageRowsOf([usage(ME, 99), usage(SAM, 99)], quotas, NAMES);
    expect(usageScaleOf(rows, 200 * GB)).toBe(5000 * GB);
    expect(usageScaleOf(rows, 9000 * GB)).toBe(9000 * GB);
  });

  it('says no quota only when the quotas are known', () => {
    const quotas = [{ profileId: SAM, bytes: 1000 * GB }];
    const rows = usageRowsOf([usage(ME, 99), usage(SAM, 399), usage(null, 9)], quotas, NAMES);
    expect(rows.map((row) => usageValueOf(row, true))).toEqual([
      `${bytes(100 * GB)} · no quota`,
      `${bytes(400 * GB)} of ${bytes(1000 * GB)} quota`,
      bytes(10 * GB),
    ]);
    const [you] = rows;
    expect(you === undefined ? null : usageValueOf(you, false)).toBe(bytes(100 * GB));
  });
});
