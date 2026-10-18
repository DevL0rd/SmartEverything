import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayKeyOf } from '../../format/time';
import {
  UNSET_FITNESS_GOALS,
  type FitnessGoals,
  type HealthDailyRow,
} from '@smarteverything/domain';
import { PHONE_WATCH_STATUS } from '../../../modules/health-connect/src/schemas';
import { emptyState, makeTable, type Device, type StoreState } from '../../store/state';

const NOW = Date.parse('2026-10-16T10:00:00Z');
const PROFILE = '00000000-0000-4000-8000-000000000001';

type PhoneStatus = ReturnType<typeof PHONE_WATCH_STATUS.parse>;

interface World {
  devices: Device[];
  profile: { readonly id: string; readonly fitness_goals: FitnessGoals } | null;
  daily: HealthDailyRow[];
  phone: PhoneStatus | null;
}

const world = vi.hoisted((): { current: World } => ({
  current: { devices: [], profile: null, daily: [], phone: null },
}));
const figures = vi.hoisted(() => ({ steps: vi.fn(), figure: vi.fn() }));

vi.mock('../../store/clock', () => ({ useDayKey: (): string => dayKeyOf(NOW) }));
vi.mock('../../store/people', () => ({
  useActiveProfile: (): World['profile'] => world.current.profile,
}));
vi.mock('../../store/store-context', () => ({
  useStoreSelector: (select: (state: StoreState) => unknown): unknown => {
    const base = emptyState();
    const byId = Object.fromEntries(world.current.daily.map((row, index) => [String(index), row]));
    const devices = Object.fromEntries(world.current.devices.map((device) => [device.id, device]));
    return select({
      ...base,
      tables: {
        ...base.tables,
        health_daily: makeTable(byId, Object.keys(byId), 1),
        devices: makeTable(devices, Object.keys(devices), 1),
      },
    });
  },
}));
vi.mock('../device-visuals', () => ({
  useTodaySteps: figures.steps,
  useTodayFigure: figures.figure,
}));
vi.mock('./watch-link', () => ({ usePhoneWatch: (): PhoneStatus | null => world.current.phone }));

const { phoneSteps, useMyWatch, useMyLiveToday, useWatchGlance } = await import('./watch-glance');

function watch(details: Record<string, unknown>, driver = 'xiaomi_watch'): Device {
  return {
    id: 'watch-1',
    provider: 'local',
    external_id: 'watch-1',
    parent_id: null,
    kind: 'sensor',
    name: 'Watch',
    display_name: null,
    model: 'band',
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: { driver, profileId: PROFILE, ...details },
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Watch',
  };
}

function phoneStatus(change: Partial<PhoneStatus>): PhoneStatus {
  return PHONE_WATCH_STATUS.parse({
    deviceId: 'watch-1',
    name: 'Watch',
    address: 'AA:BB',
    family: 'xiaomi',
    model: null,
    phase: 'connected',
    detail: '',
    battery: 80,
    charging: false,
    worn: true,
    firmware: null,
    steps: 1200,
    heartRate: 72,
    error: null,
    connectedAt: null,
    activeKcal: null,
    configJson: null,
    syncing: false,
    syncDetail: null,
    syncError: null,
    lastSyncAt: null,
    updatedAt: '2026-10-16T09:59:00.000Z',
    paused: false,
    associated: true,
    permission: true,
    vendorApps: [],
    ...change,
  });
}

function daily(day: string, metric: HealthDailyRow['metric'], value: number): HealthDailyRow {
  return {
    profile_id: PROFILE,
    day,
    metric,
    value,
    unit: 'x',
    updated_at: '2026-10-16T00:00:00.000Z',
  };
}

describe('watch glance', () => {
  beforeEach(() => {
    world.current = {
      devices: [],
      profile: { id: PROFILE, fitness_goals: UNSET_FITNESS_GOALS },
      daily: [],
      phone: null,
    };
    figures.steps.mockReset();
    figures.steps.mockReturnValue(null);
    figures.figure.mockReset();
    figures.figure.mockReturnValue(null);
  });

  it('finds the local watch of the active profile and no one else', () => {
    const mine = watch({});
    world.current.devices = [
      { ...watch({ profileId: 'someone-else' }), id: 'other' },
      { ...watch({}, 'something_else'), id: 'not-a-watch' },
      mine,
    ];
    expect(useMyWatch()?.id).toBe('watch-1');
    world.current.devices = [
      { ...mine, id: 'other', details: { ...mine.details, profileId: 'x' } },
    ];
    expect(useMyWatch()).toBeNull();
  });

  it('reads the status the hub reports when no phone is linked', () => {
    const { glance, live } = useWatchGlance(
      watch({ battery: 55, charging: true, worn: false, phase: 'connected', lastSyncAt: 'then' }),
    );
    expect(glance).toMatchObject({
      battery: 55,
      charging: true,
      worn: false,
      phase: 'connected',
      syncedAt: 'then',
      onThisPhone: false,
      today: '2026-10-16',
    });
    expect(live).toMatchObject({ heartRate: null, steps: null, syncing: false, battery: 55 });
  });

  it('ignores a reported phase that is not a watch phase', () => {
    expect(useWatchGlance(watch({ phase: 'sleeping' })).glance.phase).toBeNull();
  });

  it('prefers the live status of the phone it is linked to', () => {
    world.current.phone = phoneStatus({
      battery: 30,
      syncing: true,
      lastSyncAt: '2026-10-16T09:00:00.000Z',
    });
    const { glance, live } = useWatchGlance(watch({ battery: 99 }));
    expect(glance).toMatchObject({ battery: 30, onThisPhone: true, syncing: true });
    expect(live).toMatchObject({ heartRate: 72, steps: { value: 1200 }, syncing: true });
  });

  it('shows a heart rate only while the watch is worn and the reading is positive', () => {
    world.current.phone = phoneStatus({ worn: false });
    expect(useWatchGlance(watch({})).live.heartRate).toBeNull();
    world.current.phone = phoneStatus({ heartRate: 0 });
    expect(useWatchGlance(watch({})).live.heartRate).toBeNull();
  });

  it('takes steps from the phone only while the watch is connected to it', () => {
    world.current.phone = phoneStatus({ phase: 'waiting', steps: 500 });
    expect(useWatchGlance(watch({})).live.steps).toBeNull();
  });

  it('uses the newest resting heart rate and sleep, and distance only if it is from today', () => {
    world.current.daily = [
      daily('2026-10-14', 'resting_heart_rate', 60),
      daily('2026-10-15', 'resting_heart_rate', 58),
      daily('2026-10-15', 'sleep', 420),
      daily('2026-10-15', 'distance', 3000),
    ];
    const { glance } = useWatchGlance(watch({}));
    expect(glance.resting).toEqual({ day: '2026-10-15', value: 58 });
    expect(glance.sleep).toEqual({ day: '2026-10-15', value: 420 });
    expect(glance.distance).toBeNull();
    world.current.daily.push(daily('2026-10-16', 'distance', 4200));
    expect(useWatchGlance(watch({})).glance.distance).toBe(4200);
  });

  it('counts only the rows of the profile that owns the watch', () => {
    world.current.daily = [{ ...daily('2026-10-16', 'distance', 9000), profile_id: 'x' }];
    expect(useWatchGlance(watch({})).glance.distance).toBeNull();
  });

  it('measures steps against the profile goal, or the standard goal when none is set', () => {
    const standard = useWatchGlance(watch({})).glance.stepsGoal;
    expect(standard).toBeGreaterThan(0);
    world.current.profile = {
      id: PROFILE,
      fitness_goals: { ...UNSET_FITNESS_GOALS, steps: 12_345 },
    };
    expect(useWatchGlance(watch({})).glance.stepsGoal).toBe(12_345);
  });

  it('lists only the live figures of today', () => {
    figures.figure.mockImplementation((_watch: unknown, metric: string) =>
      metric === 'steps' ? { value: 4000, live: true } : { value: 300, live: false },
    );
    world.current.devices = [watch({})];
    expect(useMyLiveToday()).toEqual([{ metric: 'steps', value: 4000 }]);
  });

  it('dates the phone steps by the status, so the reading is the same on every render', () => {
    const status = phoneStatus({ steps: 900, updatedAt: '2026-10-16T09:58:00.000Z' });
    const first = phoneSteps(status);
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-10-16T12:00:00Z'));
    const later = phoneSteps(status);
    vi.useRealTimers();
    expect(first).toEqual({ value: 900, at: '2026-10-16T09:58:00.000Z' });
    expect(later).toEqual(first);
  });

  it('has no phone steps until the watch is connected', () => {
    expect(phoneSteps(null)).toBeNull();
    expect(phoneSteps(phoneStatus({ steps: null }))).toBeNull();
    expect(phoneSteps(phoneStatus({ phase: 'waiting', steps: 10 }))).toBeNull();
  });
});
