import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DriveApi from '../../../api/drive';
import type {
  DriveHealth,
  DriveQuotaSet,
  DriveScrubState,
  ProfileRow,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { moment } from '../../../format/time';

interface Seen {
  quotas: DriveQuotaSet[];
  scrubs: number;
}

const seen = vi.hoisted((): Seen => ({ quotas: [], scrubs: 0 }));

const RUNNING: DriveScrubState = {
  state: 'running',
  startedAt: '2026-11-07T11:00:00.000Z',
  checked: 0,
  total: 400,
  corrupt: 0,
};

vi.mock('../../../api/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof DriveApi>()),
  setDriveQuota: (body: DriveQuotaSet): Promise<{ readonly ok: true }> => {
    seen.quotas.push(body);
    return Promise.resolve({ ok: true });
  },
  startDriveScrub: (): Promise<DriveScrubState> => {
    seen.scrubs += 1;
    return Promise.resolve(RUNNING);
  },
}));

const {
  HEALTH_KEY,
  QUOTAS_KEY,
  REPORT_ADDRESS,
  backupLineOf,
  liveScrubShare,
  quotaLineOf,
  saveQuota,
  scrubLineOf,
  scrubNow,
} = await import('./page-storage');
const { gigabytesInitialOf, gigabytesOf, gigabytesProblemOf } = await import('./gigabytes');

const GIB = 1024 ** 3;
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const ANA = '00000000-0000-4000-8000-000000000301';
const BEN = '00000000-0000-4000-8000-000000000302';

const HEALTH: DriveHealth = {
  hashedShare: 1,
  verifiedShare: 1,
  corrupt: 0,
  rootsTotal: 2,
  rootsUnavailable: 0,
  watcher: 'watching',
  space: { totalBytes: 4 * GIB, freeBytes: GIB, fsType: 'ext4' },
  scrub: { state: 'idle', lastFinishedAt: null, corrupt: 0 },
  backup: { last: null, lastOkAt: null },
};

function person(id: string, name: string): ProfileRow {
  return {
    id,
    name,
    colour: 'ice',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: null,
    fitness_goals: {
      steps: null,
      move_kcal: null,
      active_minutes: null,
      sleep_minutes: null,
      hydration_ml: null,
    },
    max_heart_rate: null,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('quota writes', () => {
  beforeEach(() => {
    seen.quotas = [];
    seen.scrubs = 0;
  });

  it('turns a GB entry into bytes and an empty entry into no limit', () => {
    expect(gigabytesOf('250')).toBe(250 * GIB);
    expect(gigabytesOf('1.5')).toBe(1.5 * GIB);
    expect(gigabytesOf('  ')).toBeNull();
    expect(() => gigabytesOf('lots')).toThrow('lots is not a size in GB.');
    expect(gigabytesProblemOf('lots')).toBe('Use a size in GB, such as 250 or 1.5');
    expect(gigabytesProblemOf('12')).toBeNull();
    expect(gigabytesInitialOf(null)).toBe('');
    expect(gigabytesInitialOf(250 * GIB)).toBe('250');
    expect(gigabytesInitialOf(1.5 * GIB)).toBe('1.5');
  });

  it('sets and clears a quota, then refreshes the quota list', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await saveQuota(client, ANA, gigabytesOf('30'));
    await saveQuota(client, ANA, gigabytesOf(''));
    expect(seen.quotas).toEqual([
      { profileId: ANA, bytes: 30 * GIB },
      { profileId: ANA, bytes: null },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: QUOTAS_KEY });
    expect(QUOTAS_KEY).toEqual(['window', 'drive', 'quotas', null]);
  });

  it('draws a bar only for a person with a quota', () => {
    const usage = [
      { profileId: ANA, items: 0, folders: 0, live: 10 * GIB, versions: 4 * GIB, trash: GIB },
      { profileId: BEN, items: 0, folders: 0, live: GIB, versions: 0, trash: 0 },
    ];
    const quotas = [{ profileId: ANA, bytes: 30 * GIB }];
    expect(quotaLineOf(person(ANA, 'Ana'), usage, quotas)).toEqual({
      profileId: ANA,
      name: 'Ana',
      quota: 30 * GIB,
      share: 0.5,
      subtitle: `${bytes(15 * GIB)} used of ${bytes(30 * GIB)}`,
      tone: 'variant',
    });
    expect(quotaLineOf(person(BEN, 'Ben'), usage, quotas)).toMatchObject({
      quota: null,
      share: null,
      subtitle: `${bytes(GIB)} used · no limit`,
    });
    expect(
      quotaLineOf(person(ANA, 'Ana'), usage, [{ profileId: ANA, bytes: 10 * GIB }]),
    ).toMatchObject({
      share: 1,
      tone: 'critical',
    });
  });
});

describe('scrub and backups', () => {
  it('starts a scrub and shows its running state in the health answer', async () => {
    const client = new QueryClient();
    client.setQueryData(HEALTH_KEY, HEALTH);
    await expect(scrubNow(client)).resolves.toEqual(RUNNING);
    expect(seen.scrubs).toBe(1);
    expect(client.getQueryData<DriveHealth>(HEALTH_KEY)?.scrub).toEqual(RUNNING);
  });

  it('describes each scrub state', () => {
    expect(scrubLineOf(HEALTH.scrub, NOW)).toEqual({ text: 'Not checked yet', tone: 'variant' });
    const finished = '2026-11-04T03:00:00.000Z';
    expect(scrubLineOf({ state: 'idle', lastFinishedAt: finished, corrupt: 2 }, NOW)).toEqual({
      text: `Last checked ${moment(finished, NOW)} · 2 files damaged`,
      tone: 'critical',
    });
    expect(scrubLineOf({ ...RUNNING, checked: 100 }, NOW).text).toBe(
      'Checking · 100 of 400 · nothing damaged',
    );
    expect(scrubLineOf({ ...RUNNING, state: 'stopped', checked: 100 }, NOW).text).toBe(
      'Stopped at 100 of 400 · Scrub now carries on',
    );
  });

  it('follows live scrub progress across library folders', () => {
    expect(liveScrubShare({})).toBeNull();
    expect(
      liveScrubShare({
        [ANA]: { scrub: { done: 1, total: 4 }, scan: { done: 0, total: 10 } },
        [BEN]: { scrub: { done: 3, total: 4 } },
      }),
    ).toBe(0.5);
  });

  it('says what the last backup report was and how a backup reports in', () => {
    const at = '2026-11-07T03:00:00.000Z';
    expect(backupLineOf({ last: null, lastOkAt: null }, NOW)).toEqual({
      text: 'No backup has reported in yet',
      tone: 'variant',
    });
    expect(
      backupLineOf({ last: { at, reporter: 'restic', bytes: GIB, ok: true }, lastOkAt: at }, NOW),
    ).toEqual({
      text: `Last ${moment(at, NOW)} · ${bytes(GIB)} · from restic`,
      tone: 'positive',
    });
    expect(
      backupLineOf({ last: { at, reporter: 'restic', bytes: 0, ok: false }, lastOkAt: null }, NOW),
    ).toEqual({
      text: `Last run ${moment(at, NOW)} failed · from restic · no good backup yet`,
      tone: 'critical',
    });
    expect(REPORT_ADDRESS).toBe('POST /api/drive/backups');
  });
});
