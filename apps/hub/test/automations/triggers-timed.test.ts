import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower, type Triggers } from './support/programs';
import { useRig } from './support/use-rig';

const rig = useRig();
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const THURSDAY_MORNING = '2026-10-08T07:00:00.000Z';

async function armed(triggers: Triggers, from = THURSDAY_MORNING, name = 'Timed'): Promise<void> {
  rig().clock.jumpTo(from);
  await createAutomation(rig(), name, { triggers, actions: [setPower(rig().ids.lamp, true)] });
}

async function fired(count: number): Promise<void> {
  await rig().until(() => rig().commands().length >= count);
  await rig().settle();
}

describe('C2 clock time on weekdays', () => {
  it('runs at the clock time in the home time zone and schedules the next day', async () => {
    await armed([{ type: 'time', at: '08:00', weekdays: EVERY_DAY }]);
    expect(rig().clock.pending()).toContain('2026-10-08T08:00:00.000Z');
    rig().clock.advanceTo('2026-10-08T08:00:00.000Z');
    await fired(1);
    expect(rig().commands()).toHaveLength(1);
    expect(rig().clock.pending()).toContain('2026-10-09T08:00:00.000Z');
  });

  it('waits for the next allowed weekday and does not run on the days in between', async () => {
    await armed([{ type: 'time', at: '08:00', weekdays: [1] }]);
    expect(rig().clock.pending()).toContain('2026-10-12T08:00:00.000Z');
    expect(rig().clock.pending()).not.toContain('2026-10-08T08:00:00.000Z');
    rig().clock.advanceTo('2026-10-11T23:00:00.000Z');
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    rig().clock.advanceTo('2026-10-12T08:00:00.000Z');
    await fired(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('uses the home time zone for the clock time', async () => {
    await rig().request(API_ENDPOINTS.updateHome, { body: { time_zone: 'Asia/Tokyo' } });
    await armed([{ type: 'time', at: '08:00', weekdays: EVERY_DAY }], '2026-10-08T00:00:00.000Z');
    expect(rig().clock.pending()).toContain('2026-10-08T23:00:00.000Z');
    await rig().request(API_ENDPOINTS.updateHome, { body: { time_zone: 'UTC' } });
  });
});

function addedSince(before: readonly string[]): string[] {
  const remaining = [...before];
  return rig()
    .clock.pending()
    .filter((moment) => {
      const index = remaining.indexOf(moment);
      if (index < 0) return true;
      remaining.splice(index, 1);
      return false;
    });
}

describe('C3 sunrise and sunset with an offset', () => {
  it('runs at sunset', async () => {
    const before = rig().clock.pending();
    await armed([{ type: 'sun', event: 'sunset', offsetMinutes: 0 }]);
    const [sunset] = addedSince(before);
    expect(sunset).toMatch(/^2026-10-08T1[5-7]:/);
    rig().clock.advanceTo(sunset ?? '');
    await fired(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('places an offset trigger exactly that many minutes after the unshifted one', async () => {
    const before = rig().clock.pending();
    await armed([{ type: 'sun', event: 'sunset', offsetMinutes: 0 }]);
    await armed([{ type: 'sun', event: 'sunset', offsetMinutes: 45 }], THURSDAY_MORNING, 'Later');
    const [plain, shifted] = addedSince(before);
    expect(Date.parse(shifted ?? '') - Date.parse(plain ?? '')).toBe(45 * 60_000);
  });

  it('runs at sunrise in the morning of the same day', async () => {
    const before = rig().clock.pending();
    await armed([{ type: 'sun', event: 'sunrise', offsetMinutes: 0 }], '2026-10-08T00:00:00.000Z');
    expect(addedSince(before)[0]).toMatch(/^2026-10-08T0[4-6]:/);
  });

  it('records a named error on a home without a location instead of scheduling', async () => {
    await rig().request(API_ENDPOINTS.updateHome, { body: { latitude: null, longitude: null } });
    await armed([{ type: 'sun', event: 'sunset', offsetMinutes: 0 }]);
    await rig().until(async () => {
      const rows = await rig().request(API_ENDPOINTS.listAutomations);
      return rows[0]?.last_error?.includes('latitude') === true;
    });
    await rig().request(API_ENDPOINTS.updateHome, { body: { latitude: 52.52, longitude: 13.405 } });
  });
});

describe('C4 every N minutes', () => {
  it('runs after each interval and schedules the next one from the previous due time', async () => {
    await armed([{ type: 'interval', everyMinutes: 15 }]);
    expect(rig().clock.pending()).toContain('2026-10-08T07:15:00.000Z');
    rig().clock.advanceTo('2026-10-08T07:15:00.000Z');
    await fired(1);
    expect(rig().clock.pending()).toContain('2026-10-08T07:30:00.000Z');
    rig().clock.advanceTo('2026-10-08T07:30:00.000Z');
    await fired(2);
    expect(rig().commands()).toHaveLength(2);
  });
});
