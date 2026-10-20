import { waterEntryOf, type BottleSyncUpload } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryConfigOf } from '../../../src/local/bottle/config';
import { syncPlanOf } from '../../../src/local/bottle/plan';
import { SNAP } from '../../../src/local/bottle/snapshots';
import { planDepsOf } from '../../../src/local/bottle/ingest';
import { runPlan } from '../../support/fake-phone';
import { captureLogs } from '../../support/logs';
import { bottleRig, seedDevice, tofRow, type BottleRig } from '../../support/bottle-rig';

const D_650 = 28;
const D_600 = 42;
const D_550 = 54;
const D_450 = 78;

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

function aDay(): void {
  rig.cap.tof.rows.push(
    tofRow(rig.seconds(-300), D_650),
    tofRow(rig.seconds(-270), D_600),
    tofRow(rig.seconds(-240), D_550),
    tofRow(rig.seconds(-200), D_450),
    tofRow(rig.seconds(-100), D_650, 'cap_on_flap'),
    tofRow(rig.seconds(-60), D_600),
  );
}

function hydration(): { sourceApp: string; liters: number }[] {
  return rig.test.store.health
    .records(
      { types: ['Hydration'], from: '2026-10-17T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' },
      rig.owner.profile.id,
    )
    .flatMap((record) =>
      record.type === 'Hydration'
        ? [{ sourceApp: record.sourceApp, liters: record.data.liters }]
        : [],
    );
}

describe('a day of drinking read from the cap', () => {
  it('classifies the readings in order and keeps the derived figures with each row', async () => {
    aDay();
    await rig.sync();
    const rows = rig.test.store.bottleReadings.all(rig.device.id);
    expect(rows.map((row) => [row.kind, row.verdict])).toStrictEqual([
      ['seed', 'accepted'],
      ['drink', 'accepted'],
      ['drink', 'accepted'],
      ['drink', 'accepted'],
      ['fill', 'accepted'],
      ['drink', 'accepted'],
    ]);
    expect(rows.map((row) => row.eventMl)).toStrictEqual([null, 52, 49, 101, 202, 52]);
  });

  it('saves each drink once in the water log of the person, labelled as the bottle', async () => {
    aDay();
    await rig.sync();
    const drinks = rig.test.store.bottleReadings.drinks(rig.device.id, { from: 0, to: 4e9 });
    expect(drinks.filter((drink) => drink.kind === 'drink').map((drink) => drink.ml)).toStrictEqual(
      [52, 49, 101, 52],
    );
    expect(drinks.filter((drink) => drink.kind === 'fill').map((drink) => drink.ml)).toStrictEqual([
      202,
    ]);
    expect(drinks.every((drink) => drink.kind === 'fill' || drink.entryId !== null)).toBe(true);
    expect(hydration()).toHaveLength(4);
    expect(hydration().every((record) => record.sourceApp === 'smarteverything.larq')).toBe(true);
    expect(hydration().reduce((sum, record) => sum + record.liters, 0)).toBeCloseTo(0.254, 6);
  });

  it('adds nothing when the same history arrives again', async () => {
    aDay();
    const first = await rig.sync();
    expect(first.accepted).toBeGreaterThan(0);
    await rig.sync(1);
    await rig.sync(2);
    expect(rig.test.store.bottleReadings.all(rig.device.id)).toHaveLength(6);
    expect(hydration()).toHaveLength(4);
  });

  it('does not bring back a drink the person deleted', async () => {
    aDay();
    const entry = rig.entry();
    const plan = syncPlanOf(planDepsOf(rig.ingestDeps), { entry, deviceId: rig.device.id });
    const upload = runPlan(plan, rig.cap, { now: rig.clock.now() });
    await rig.ingest.process(rig.row(), entry, rig.owner.client, upload);
    const [first] = rig.test.store.bottleReadings.drinks(rig.device.id, { from: 0, to: 4e9 });
    expect(first?.entryId).not.toBeNull();
    rig.test.store.healthEntries.remove(first?.entryId ?? '', rig.owner.profile.id);
    await rig.ingest.process(rig.row(), entry, rig.owner.client, upload);
    expect(hydration()).toHaveLength(3);
  });

  it('asks the next sync only for what is newer than what it keeps', async () => {
    aDay();
    await rig.sync();
    const entry = rig.entry();
    const plan = syncPlanOf(planDepsOf(rig.ingestDeps), { entry, deviceId: rig.device.id });
    const tof = plan.steps.find((step) => step.kind === 'log' && step.log === 'tof');
    expect(tof).toMatchObject({ fromTimestamp: rig.seconds(-60) });
  });
});

describe('readings that must not become drinks', () => {
  it('keeps a reading stamped before the cap clock was set, but makes no drink from it', async () => {
    rig.cap.tof.rows.push(tofRow(5000, D_650), tofRow(6000, D_450));
    await rig.sync();
    const rows = rig.test.store.bottleReadings.all(rig.device.id);
    expect(rows.map((row) => row.verdict)).toStrictEqual(['clock_invalid', 'clock_invalid']);
    expect(hydration()).toHaveLength(0);
  });

  it('keeps an out-of-range reading as a rejected row', async () => {
    rig.cap.tof.rows.push(tofRow(rig.seconds(-30), 255));
    await rig.sync();
    expect(rig.test.store.bottleReadings.all(rig.device.id)[0]).toMatchObject({
      verdict: 'out_of_range',
      kind: 'rejected',
      volumeMl: null,
    });
  });

  it('replays the whole history when a late row arrives before rows already kept, correcting the drink it changes', async () => {
    rig.cap.tof.rows.push(tofRow(rig.seconds(-300), D_650), tofRow(rig.seconds(-60), D_450));
    await rig.sync();
    expect(hydration()).toHaveLength(1);
    rig.cap.tof.rows.push(tofRow(rig.seconds(-200), D_550));
    const entry = rig.entry();
    const upload: BottleSyncUpload = runPlan(
      {
        serial: entry.address,
        steps: [{ kind: 'log', name: 'log_tof', log: 'tof', fromTimestamp: 0, limit: 5 }],
      },
      rig.cap,
      { now: rig.clock.now() },
    );
    await rig.ingest.process(rig.row(), entry, rig.owner.client, upload);
    const rows = rig.test.store.bottleReadings.all(rig.device.id);
    expect(rows.map((row) => row.kind)).toStrictEqual(['seed', 'drink', 'drink']);
    expect(
      hydration()
        .map((record) => Math.round(record.liters * 1000))
        .sort(),
    ).toStrictEqual([101, 102]);
  });
});

describe('a bottle that is forgotten and added again', () => {
  it('syncs its old history again without writing the drinks twice', async () => {
    aDay();
    await rig.sync();
    expect(hydration()).toHaveLength(4);
    const externalId = rig.row().external_id;
    rig.test.store.localDevices.remove(externalId);
    rig.test.store.devices.remove([rig.device.id]);
    const added = seedDevice(rig.test, rig.owner.profile.id, rig.clock.now());
    const entry = rig.test.store.localDevices.byExternalId(added.externalId);
    const plan = syncPlanOf(planDepsOf(rig.ingestDeps), { entry, deviceId: added.device.id });
    const upload = runPlan(plan, rig.cap, { now: rig.clock.now() });
    const result = await rig.ingest.process(added.device, entry, rig.owner.client, upload);
    expect(result.accepted).toBeGreaterThan(0);
    expect(rig.test.store.bottleReadings.all(added.device.id)).toHaveLength(6);
    const drinks = rig.test.store.bottleReadings.drinks(added.device.id, { from: 0, to: 4e9 });
    expect(drinks.filter((drink) => drink.kind === 'drink')).toHaveLength(4);
    expect(drinks.every((drink) => drink.kind === 'fill' || drink.entryId !== null)).toBe(true);
    expect(hydration()).toHaveLength(4);
  });
});

describe('a drink that ends a sync with a weak signal', () => {
  const WEAK_KCPS = 23;

  it('is decided when the next reading arrives in a later sync', async () => {
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-300), D_650),
      tofRow(rig.seconds(-200), D_600, 'cap', WEAK_KCPS),
    );
    await rig.sync();
    expect(rig.test.store.bottleReadings.all(rig.device.id)).toHaveLength(1);
    expect(hydration()).toHaveLength(0);
    rig.cap.tof.rows.push(tofRow(rig.seconds(-100), D_600));
    await rig.sync(1);
    const rows = rig.test.store.bottleReadings.all(rig.device.id);
    expect(rows.map((row) => [row.kind, row.verdict])).toStrictEqual([
      ['seed', 'accepted'],
      ['drink', 'accepted'],
      ['small', 'accepted'],
    ]);
    expect(hydration()).toHaveLength(1);
  });

  it('is asked for again by the next sync while it stays undecided', async () => {
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-300), D_650),
      tofRow(rig.seconds(-200), D_600, 'cap', WEAK_KCPS),
    );
    await rig.sync();
    const plan = syncPlanOf(planDepsOf(rig.ingestDeps), {
      entry: rig.entry(),
      deviceId: rig.device.id,
    });
    const tof = plan.steps.find((step) => step.kind === 'log' && step.log === 'tof');
    expect(tof).toMatchObject({ fromTimestamp: rig.seconds(-300) });
  });

  it('is not kept when a later reading shows it jumped away and back', async () => {
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-300), D_650),
      tofRow(rig.seconds(-200), D_450, 'cap', WEAK_KCPS),
    );
    await rig.sync();
    rig.cap.tof.rows.push(tofRow(rig.seconds(-100), D_650));
    await rig.sync(1);
    expect(
      rig.test.store.bottleReadings.all(rig.device.id).map((row) => row.verdict),
    ).toStrictEqual(['accepted', 'weak', 'accepted']);
    expect(hydration()).toHaveLength(0);
  });
});

describe('sips after a refill the cap read with a weak signal', () => {
  it('counts the sips from the new level once a reading shows the rise', async () => {
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-600), 103, 'cap_on_flap_open_sip', 130),
      tofRow(rig.seconds(-590), 113, 'cap_on_flap_open_sip', 71),
    );
    await rig.sync();
    rig.cap.tof.rows.push(tofRow(rig.seconds(-400), 71, 'cap', 64));
    await rig.sync(1);
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-30), 83, 'cap_on_flap_open_sip', 202),
      tofRow(rig.seconds(-20), 89, 'cap_on_flap_open_sip', 206),
      tofRow(rig.seconds(-10), 94, 'cap_on_flap_open_sip', 378),
    );
    await rig.sync(2);
    const rows = rig.test.store.bottleReadings.all(rig.device.id);
    expect(rows.map((row) => [row.verdict, row.kind, row.volumeMl])).toStrictEqual([
      ['accepted', 'seed', 354],
      ['weak', 'rejected', 321],
      ['weak', 'rejected', 478],
      ['accepted', 'small', 429],
      ['accepted', 'drink', 405],
      ['accepted', 'drink', 386],
    ]);
    expect(
      hydration()
        .map((record) => Math.round(record.liters * 1000))
        .sort(),
    ).toStrictEqual([19, 23]);
  });
});

describe('a bottle nobody owns yet', () => {
  it('reads levels and fills but saves no drinks until it is bound', async () => {
    await rig.close();
    rig = await bottleRig({ bound: null });
    aDay();
    await rig.sync();
    expect(rig.test.store.bottleReadings.all(rig.device.id)).toHaveLength(6);
    expect(hydration()).toHaveLength(0);
    const fills = rig.test.store.bottleReadings
      .drinks(rig.device.id, { from: 0, to: 4e9 })
      .filter((drink) => drink.kind === 'fill');
    expect(fills).toHaveLength(1);
  });

  it('backfills the drinks of the stored readings when the owner binds it', async () => {
    await rig.close();
    rig = await bottleRig({ bound: null });
    aDay();
    await rig.sync();
    const result = await rig.act(rig.owner, {
      action: 'bind_person',
      personId: rig.owner.profile.id,
    });
    expect(result.ok).toBe(true);
    expect(hydration()).toHaveLength(4);
    expect(entryConfigOf(rig.entry()).binding).toMatchObject({
      profileId: rig.owner.profile.id,
      boundBy: rig.owner.profile.id,
    });
  });
});

describe('what the cap reports besides drinks', () => {
  it('stores battery reads, the cap state, the clock drift and the device strings', async () => {
    rig.cap.uiState = 8;
    rig.cap.battery = 57;
    rig.cap.clockMs += 90_000;
    await rig.sync();
    expect(rig.test.store.bottleLogs.newestBattery(rig.device.id)).toMatchObject({ pct: 57 });
    expect(rig.snapshots.get(rig.device.id, SNAP.uiState)?.value.state).toBe('charging');
    expect(rig.snapshots.get(rig.device.id, SNAP.timeDrift)?.value.driftSeconds).toBe(90);
    expect(rig.snapshots.get(rig.device.id, SNAP.dis)?.value.firmware).toBe('2.3.1');
  });

  it('reads UV cycles and faults from their logs once each', async () => {
    rig.cap.activation.rows.push(
      { at: rig.seconds(-20), mode: 'normal', socPct: 60 },
      { at: rig.seconds(-500), mode: 'maintenance', socPct: 63 },
    );
    rig.cap.faults.rows.push({ at: rig.seconds(-90), type: 'uv_led_open' });
    await rig.sync();
    await rig.sync(1);
    expect(rig.test.store.bottleLogs.uv(rig.device.id, { from: 0, to: 4e9 })).toHaveLength(2);
    expect(rig.test.store.bottleLogs.faults(rig.device.id, 10)).toStrictEqual([
      { at: rig.seconds(-90), type: 'uv_led_open' },
    ]);
    const faultEvents = rig.events.filter((event) => event.kind === 'fault');
    expect(faultEvents).toHaveLength(1);
  });

  it('remembers a request this firmware does not answer and stops asking for it', async () => {
    rig.cap.unsupported.add('RequestGetCapStateLog');
    await rig.sync();
    expect(entryConfigOf(rig.entry()).unsupported).toStrictEqual({
      firmware: '2.3.1',
      requests: ['log_state'],
    });
    const plan = syncPlanOf(planDepsOf(rig.ingestDeps), {
      entry: rig.entry(),
      deviceId: rig.device.id,
    });
    expect(plan.steps.some((step) => step.name === 'log_state')).toBe(false);
  });

  it('publishes the level, the battery, the cap state and the reminder as device state', async () => {
    aDay();
    rig.cap.battery = 80;
    await rig.sync();
    const latest = (capability: string): unknown =>
      rig.states.filter((update) => update.capability === capability).at(-1)?.value;
    expect(latest('bottle_volume')).toBe(599);
    expect(latest('water_level')).toBe(88);
    expect(latest('battery')).toBe(80);
    expect(latest('bottle_state')).toBe('on');
    expect(latest('bottle_link')).toBe('asleep');
    expect(latest('hydration_reminder')).toBe('off');
    expect(rig.observed.at(-1)).toMatchObject({ lastSyncOutcome: 'ok', firmware: '2.3.1' });
  });
});

describe('events from a sync', () => {
  it('folds old drinks into one import event and announces a recent drink by itself', async () => {
    aDay();
    rig.cap.tof.rows.push(tofRow(rig.seconds(-5), 66));
    await rig.sync();
    const activity = rig.events.filter((event) => event.kind === 'activity');
    expect(
      activity.filter((event) => event.details['activity'] === 'drinks_imported'),
    ).toHaveLength(1);
    const single = activity.filter((event) => event.details['activity'] === 'drink');
    expect(single).toHaveLength(1);
    expect(single[0]?.details).toMatchObject({ ml: 100 });
    expect(activity.some((event) => event.details['activity'] === 'refill')).toBe(false);
  });

  it('says the goal was reached once, on the drink that reached it', async () => {
    const today = '2026-10-18';
    rig.test.store.healthEntries.create(
      rig.owner.profile.id,
      waterEntryOf(1900, {
        startTime: `${today}T07:00:00.000Z`,
        endTime: `${today}T07:01:00.000Z`,
        zoneOffsetSeconds: 0,
      }),
    );
    rig.cap.tof.rows.push(tofRow(rig.seconds(-20), D_650), tofRow(rig.seconds(-10), D_450));
    await rig.sync();
    const reached = rig.events.filter((event) => event.details['activity'] === 'goal_reached');
    expect(reached).toHaveLength(1);
    expect(reached[0]?.occurrence).toBe(`goal:${rig.owner.profile.id}:${today}`);
  });

  it('announces charging starting and a low battery once', async () => {
    rig.cap.uiState = 8;
    rig.cap.battery = 14;
    await rig.sync();
    await rig.sync(1);
    const activity = rig.events.filter((event) => event.details['activity'] === 'charging_started');
    expect(activity).toHaveLength(1);
    expect(
      rig.events.filter((event) => event.details['maintenance'] === 'battery_low'),
    ).toHaveLength(1);
  });
});

describe('writes that wait for the bottle to wake', () => {
  it('keeps the wish, sends it with a read-back at the next wake and then forgets it', async () => {
    const saved = await rig.act(rig.owner, {
      action: 'set_reminder',
      reminder: {
        state: 'interval_fixed',
        intervalMin: 45,
        from: '08:00',
        to: '21:00',
        colour: '#46b8ff',
      },
    });
    expect(saved.ok).toBe(true);
    expect(entryConfigOf(rig.entry()).desired.reminder).toMatchObject({ intervalMin: 45 });
    await rig.sync();
    expect(rig.cap.writes).toStrictEqual(['reminder']);
    expect(rig.cap.reminder).toMatchObject({
      state: 1,
      start: 28_800,
      stop: 75_600,
      interval: 2700,
    });
    expect(entryConfigOf(rig.entry()).desired.reminder).toBeNull();
    expect(rig.snapshots.get(rig.device.id, SNAP.reminder)?.value).toMatchObject({
      state: 'interval_fixed',
      intervalSeconds: 2700,
    });
    await rig.sync(1);
    expect(rig.cap.writes).toStrictEqual(['reminder']);
  });

  it('follows the reminder window with automatic quiet hours', async () => {
    await rig.sync();
    await rig.act(rig.owner, { action: 'set_quiet_hours', quiet: { state: 'auto' } });
    await rig.act(rig.owner, {
      action: 'set_reminder',
      reminder: { state: 'interval_fixed', from: '09:00', to: '20:00' },
    });
    await rig.sync(1);
    expect(rig.cap.quiet).toMatchObject({ state: 2, start: 72_000, stop: 32_400 });
  });
});
