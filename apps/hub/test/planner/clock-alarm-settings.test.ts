import {
  createClientToken,
  hashClientToken,
  PLANNER_ALARM_ROW,
  type PlannerAlarmRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plannerPreferencesOf } from '../../src/planner/preferences';
import type { plannerClockRoutes } from '../../src/server/handlers/planner-clock';
import {
  buildClockHarness,
  call,
  MISSING,
  STATION,
  type ClockHarness,
} from '../support/clock-harness';
import type { TestPerson } from '../support/phone-fixtures';
import { furnishHome } from '../support/tool-home';
import type { TestStore } from '../support/store';

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let routes: ReturnType<typeof plannerClockRoutes>;
let advance: ClockHarness['advance'];
let close: ClockHarness['close'];

const alarm = async (person: TestPerson, body: object): Promise<PlannerAlarmRow> =>
  PLANNER_ALARM_ROW.parse(await call(routes.createPlannerAlarm, person, { body }));

beforeEach(async () => {
  ({ test, owner, ann, routes, advance, close } = await buildClockHarness());
});

afterEach(async () => {
  await close();
});

describe('alarm sound, limit, challenge and sunrise', () => {
  const desktopOnly = (): object => {
    const desktop = test.store.clients.create({
      name: 'Desk',
      platform: 'desktop',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
      profileId: ann.profileId,
    });
    return { targets: [{ kind: 'client', clientId: desktop.id }] };
  };

  it('keeps a sound, a limit, a challenge and a sunrise on the alarm', async () => {
    const { lamp } = furnishHome(test.store);
    const made = await alarm(owner, {
      time: '07:00',
      sound: {
        kind: 'radio',
        station_id: STATION.station_id,
        name: STATION.name,
        url: STATION.url,
      },
      snooze_limit: 2,
      challenge: { kind: 'maths', difficulty: 'easy', count: 3 },
      sunrise: { lights: [lamp.id], minutes: 20, colour: true },
    });
    expect(made).toMatchObject({
      sound: { kind: 'radio', name: STATION.name },
      snooze_limit: 2,
      challenge: { kind: 'maths', difficulty: 'easy', count: 3 },
      sunrise: { lights: [lamp.id], minutes: 20, colour: true },
    });
  });

  it('starts from the clock defaults for the limit and the sound', async () => {
    const made = await alarm(ann, { time: '07:00' });
    const defaults = plannerPreferencesOf(test.store, ann.profileId).clock;
    expect(made.snooze_limit).toBe(defaults.snooze_limit);
    expect(made.challenge).toEqual({ kind: 'none' });
    expect(made.sunrise).toBeNull();
  });

  it('refuses a file sound that is not an audio file you can open', async () => {
    await expect(
      call(routes.createPlannerAlarm, ann, {
        body: { time: '07:00', sound: { kind: 'file', item_id: MISSING } },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses a QR or steps challenge on an alarm with no phone to ring on', async () => {
    const targets = desktopOnly();
    await expect(
      call(routes.createPlannerAlarm, ann, {
        body: { time: '07:00', challenge: { kind: 'qr', code: 'kitchen' }, ...targets },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      call(routes.createPlannerAlarm, ann, {
        body: { time: '07:00', challenge: { kind: 'steps', steps: 20 }, ...targets },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const maths = await alarm(ann, {
      time: '07:00',
      challenge: { kind: 'maths', difficulty: 'hard', count: 2 },
      ...targets,
    });
    expect(maths.challenge.kind).toBe('maths');
  });

  it('checks the challenge again when the places of the alarm change', async () => {
    const made = await alarm(ann, {
      time: '07:00',
      challenge: { kind: 'steps', steps: 30 },
      targets: [{ kind: 'client', clientId: ann.client.id }],
    });
    await expect(
      call(routes.updatePlannerAlarm, ann, { params: { alarmId: made.id }, body: desktopOnly() }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses a sunrise light that cannot be switched on', async () => {
    const { camera } = furnishHome(test.store);
    await expect(
      call(routes.createPlannerAlarm, owner, {
        body: { time: '07:00', sunrise: { lights: [camera.id], minutes: 10, colour: false } },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses a snooze once the limit is used up', async () => {
    const made = await alarm(ann, { time: '08:30', snooze_limit: 1 });
    await advance('2026-11-07T08:30:00.000Z');
    const [ring] = test.store.plannerRings.forRef('alarm', made.id);
    if (ring === undefined) throw new Error('The alarm did not ring.');
    const params = { alarmId: made.id };
    await call(routes.snoozePlannerAlarm, ann, { params, body: { ringId: ring.id } });
    await advance('2026-11-07T08:39:00.000Z');
    await expect(
      call(routes.snoozePlannerAlarm, ann, { params, body: { ringId: ring.id } }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('radio search', () => {
  it('returns the stations of the directory', async () => {
    const found = await call(routes.searchPlannerRadio, ann, { query: { text: 'bbc' } });
    expect(found).toEqual([STATION]);
  });
});
