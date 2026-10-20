import {
  BOTTLE_VIEW,
  waterEntryOf,
  type BottleReadQuery,
  type BottleView,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readView } from '../../../src/local/bottle/views';
import { captureLogs } from '../../support/logs';
import { bottleRig, tofRow, type BottleRig, type Person } from '../../support/bottle-rig';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
  rig.cap.tof.rows.push(
    tofRow(rig.seconds(-300), 28),
    tofRow(rig.seconds(-270), 42),
    tofRow(rig.seconds(-240), 54),
    tofRow(rig.seconds(-200), 78),
    tofRow(rig.seconds(-100), 28, 'cap_on_flap'),
    tofRow(rig.seconds(-60), 42),
  );
  rig.cap.battery = 61;
  rig.cap.activation.rows.push({ at: rig.seconds(-90), mode: 'normal', socPct: 60 });
  rig.cap.faults.rows.push({ at: rig.seconds(-400), type: 'uv_led_open' });
});

afterEach(async () => {
  await rig.close();
});

function read(query: BottleReadQuery, by: Person = rig.owner): BottleView {
  const viewer = { clientId: by.client.id, role: by.client.role, profileId: by.profile.id };
  return BOTTLE_VIEW.parse(
    readView({ deps: rig.views, device: rig.row(), viewer }, rig.entry(), query),
  );
}

function isView<V extends BottleView['view']>(
  view: BottleView,
  name: V,
): view is Extract<BottleView, { view: V }> {
  return view.view === name;
}

function only<V extends BottleView['view']>(
  view: BottleView,
  name: V,
): Extract<BottleView, { view: V }> {
  if (!isView(view, name)) {
    throw new Error(`expected the ${name} view, got ${view.view}`);
  }
  return view;
}

describe('the status of the bottle', () => {
  it('shows an unsynced bottle as waiting for its first sync, with no level and no reading yet', () => {
    const status = only(read({ view: 'status' }), 'status');
    expect(status).toMatchObject({
      firstSyncPending: true,
      link: 'asleep',
      lastSyncAt: null,
      level: { ml: null },
    });
  });

  it('shows the level, the battery, today’s drinks and the pace window after a sync', async () => {
    await rig.sync();
    const status = only(read({ view: 'status' }), 'status');
    expect(status).toMatchObject({
      name: 'Kitchen bottle',
      model: 'PureVis 2',
      body: 680,
      firstSyncPending: false,
      lastSyncOutcome: 'ok',
      level: { ml: 599, pct: 88, reliable: true },
      cap: { state: 'on', batteryPct: 61, charging: 'not_charging' },
      uv: { lastMode: 'normal' },
      mayStartUv: true,
      uvRefusal: null,
      person: { name: rig.owner.profile.name },
    });
    expect(status.today.drinks.map((drink) => drink.ml)).toStrictEqual([52, 49, 101, 52]);
    expect(status.today.fills).toHaveLength(1);
    expect(status.today.bottleMl).toBe(254);
    expect(status.today.paceFromMinute).toBe(420);
    expect(status.today.levels).toHaveLength(6);
  });

  it('splits today’s water into the bottle, what was logged here and other apps', async () => {
    await rig.sync();
    rig.test.store.healthEntries.create(
      rig.owner.profile.id,
      waterEntryOf(300, {
        startTime: '2026-10-18T09:00:00.000Z',
        endTime: '2026-10-18T09:01:00.000Z',
        zoneOffsetSeconds: 0,
      }),
    );
    const { today } = only(read({ view: 'status' }), 'status');
    expect(today.loggedMl).toBe(300);
    expect(today.otherMl).toBe(0);
    expect(today.totalMl).toBe(554);
    expect(today.hourly[9]).toBe(300);
  });

  it('says the bottle is syncing while a phone is being asked', async () => {
    await rig.sync();
    const waiting = rig.act(rig.owner, { action: 'sync' });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const push = rig.pushes.at(-1);
    rig.broker.answer(push?.clientId ?? '', String(push?.payload['requestId']), {
      ok: true,
      detail: 'Synced.',
    });
    await waiting;
    expect(only(read({ view: 'status' }), 'status').link).toBe('asleep');
  });

  it('reports a fault with its plain name and blocks cleaning with a reason', async () => {
    rig.cap.uiState = 1;
    await rig.sync();
    const status = only(read({ view: 'status' }), 'status');
    expect(status.cap.fault).toBe('UV light failed (open circuit)');
    expect(status.uvRefusal).toBe('Cleaning is off while the cap reports a fault.');
  });
});

describe('the other views', () => {
  beforeEach(async () => {
    await rig.sync();
  });

  it('lists drinks and readings, newest first, a page at a time', () => {
    const drinks = only(read({ view: 'drinks', limit: 3 }), 'drinks');
    expect(drinks.drinks).toHaveLength(3);
    expect(drinks.more).toBe(true);
    const readings = only(read({ view: 'readings', limit: 10 }), 'readings');
    expect(readings.readings.map((row) => row.kind)).toStrictEqual([
      'drink',
      'fill',
      'drink',
      'drink',
      'drink',
      'seed',
    ]);
    expect(readings.more).toBe(false);
    expect(only(read({ view: 'drinks', day: '2026-10-18' }), 'drinks').drinks).toHaveLength(5);
  });

  it('cuts sessions at each fill, with the drinks in between', () => {
    const sessions = only(read({ view: 'sessions' }), 'sessions').sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.drinks)).toStrictEqual([1, 3]);
    expect(sessions[1]?.drunkMl).toBe(202);
  });

  it('computes the stats of every range from the same data', () => {
    for (const range of ['day', 'week', 'month', 'year'] as const) {
      const stats = only(read({ view: 'stats', range }), 'stats');
      expect(stats.range).toBe(range);
      expect(stats.heatmap).toHaveLength(371);
    }
    const week = only(read({ view: 'stats', range: 'week' }), 'stats');
    expect(week.chips.total.value).toBe(254);
    expect(week.chips.drinks.value).toBe(4);
    expect(week.sources.bottleMl).toBe(254);
    expect(week.bars.at(-1)).toMatchObject({ key: '2026-10-18', totalMl: 254 });
    expect(week.daily.at(-1)).toMatchObject({ drinks: 4, fills: 1 });
    expect(week.sizes.count).toBe(4);
  });

  it('serves the stats from a cache until the water changes', () => {
    const first = only(read({ view: 'stats', range: 'week' }), 'stats');
    rig.test.store.healthEntries.create(
      rig.owner.profile.id,
      waterEntryOf(500, {
        startTime: '2026-10-18T10:00:00.000Z',
        endTime: '2026-10-18T10:01:00.000Z',
        zoneOffsetSeconds: 0,
      }),
    );
    expect(only(read({ view: 'stats', range: 'week' }), 'stats').chips.total.value).toBe(
      first.chips.total.value,
    );
    rig.stats.invalidate();
    expect(only(read({ view: 'stats', range: 'week' }), 'stats').chips.total.value).toBe(754);
  });

  it('shows the care page: cleaning days, battery, faults and the filter', async () => {
    await rig.act(rig.owner, { action: 'set_filter', installed: true, type: 'essential' });
    const care = only(read({ view: 'care' }), 'care');
    expect(care.uvDays).toHaveLength(30);
    expect(care.uvDays.at(-1)).toMatchObject({ normal: 1 });
    expect(care.battery).toMatchObject({ pct: 61, alertPct: 20, lockoutPct: 5 });
    expect(care.faults).toStrictEqual([
      expect.objectContaining({ type: 'uv_led_open', known: true, active: false }),
    ]);
    expect(care.filter).toMatchObject({ type: 'essential', litresLimit: 94, daysUsed: 0 });
  });

  it('shows the settings with what waits for the next wake', async () => {
    await rig.act(rig.owner, { action: 'set_reminder', reminder: { intervalMin: 20 } });
    const settings = only(read({ view: 'settings' }), 'settings');
    expect(settings.pending.reminder).toStrictEqual({ intervalMin: 20 });
    expect(settings.syncs).toHaveLength(1);
    expect(settings).toMatchObject({ mayEdit: true, body: 680, calibration: null });
  });

  it('shows the diagnostics with the serial masked and the signal quality', () => {
    const diagnostics = only(read({ view: 'diagnostics' }), 'diagnostics');
    expect(diagnostics.device).toMatchObject({
      serial: '…CDEF',
      firmware: '2.3.1',
      manufacturer: 'LARQ',
    });
    expect(diagnostics.quality).toMatchObject({ accepted: 6, small: 0, rejected: 0 });
    expect(diagnostics.signal.kcps).toHaveLength(6);
    expect(diagnostics.capSettings.map((row) => row.label)).toContain('Low battery alert');
  });

  it('sees a calibration change the volumes read afterwards, not the ones before', async () => {
    const points = [16, 37, 68, 93.5, 121, 161, 183, 207].map((distanceMm, index) => ({
      distanceMm,
      ml: [717, 600, 500, 400, 300, 200, 100, 0][index] ?? 0,
    }));
    const result = await rig.act(rig.owner, { action: 'set_calibration', points });
    expect(result.ok).toBe(true);
    expect(only(read({ view: 'settings' }), 'settings').calibration).toMatchObject({ points: 8 });
    const cleared = await rig.act(rig.owner, { action: 'clear_calibration' });
    expect(cleared.ok).toBe(true);
    expect(only(read({ view: 'settings' }), 'settings').calibration).toBeNull();
  });
});
