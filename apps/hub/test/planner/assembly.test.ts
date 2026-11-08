import {
  API_ENDPOINTS as E,
  GOOGLE_ACCOUNT_ROW,
  PLANNER_ALARM_ROW,
  PLANNER_COLLECTION_ROW,
  PLANNER_DAY,
  PLANNER_ITEM_ROW,
  PLANNER_PHONE_RING_SET,
  PLANNER_STOPWATCH_ROW,
  PLANNER_TIMER_ROW,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeGoogle, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET } from '../fakes/google';
import { bootServer, useBootedServer, type Booted } from '../support/booted';
import { call, openLive, temporaryDirectory } from '../support/server';

const suite = useBootedServer({ linked: false });

describe('planner wiring', () => {
  it('creates an item over HTTP and sends the live change to the app store', async () => {
    const { base, owner } = suite.current;
    const live = await openLive(base, owner);
    live.socket.send(
      JSON.stringify({
        type: 'subscribe',
        tables: ['planner_collections', 'planner_items', 'google_accounts'],
        streams: [],
      }),
    );
    await live.next((message) => message.type === 'subscribed');

    const created = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body: { kind: 'calendar', name: 'Home', colour: 'home', icon: 'house' },
    });
    expect(created.status).toBe(200);
    const collection = await live.next(
      (message) => message.type === 'change' && message.table === 'planner_collections',
    );
    expect(collection).toMatchObject({ operation: 'INSERT', record: { name: 'Home' } });

    const made = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/items',
      body: {
        collection_id: PLANNER_COLLECTION_ROW.parse(created.body).id,
        kind: 'event',
        title: 'Plumber',
        start_local: '2026-11-09T09:00',
        time_zone: 'UTC',
      },
    });
    expect(made.status).toBe(200);
    const item = PLANNER_ITEM_ROW.parse(made.body);
    const change = await live.next(
      (message) => message.type === 'change' && message.table === 'planner_items',
    );
    expect(change).toMatchObject({
      operation: 'INSERT',
      record: { id: item.id, title: 'Plumber', start: '2026-11-09T09:00:00.000Z' },
    });
    live.socket.close();
  });

  it('answers the planner preferences and deletes an item over HTTP', async () => {
    const { base, owner } = suite.current;
    const preferences = await call(base, owner, {
      method: 'GET',
      path: '/api/planner/preferences',
    });
    expect(preferences.status).toBe(200);
    const list = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body: { kind: 'list', name: 'Chores', colour: 'family', icon: 'check' },
    });
    const task = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/items',
      body: {
        collection_id: PLANNER_COLLECTION_ROW.parse(list.body).id,
        kind: 'task',
        title: 'Bins',
      },
    });
    const id = PLANNER_ITEM_ROW.parse(task.body).id;
    const removed = await call(base, owner, { method: 'DELETE', path: `/api/planner/items/${id}` });
    expect(removed).toMatchObject({ status: 200, body: { ok: true } });
  });

  it('serves the day and the clock over HTTP and announces the summary after a write', async () => {
    const { base, owner } = suite.current;
    const live = await openLive(base, owner);
    const ready = await live.next((message) => message.type === 'ready');
    if (ready.type !== 'ready') throw new Error('The live socket did not send ready.');
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['planner_alarms'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');

    const day = await call(base, owner, {
      method: 'GET',
      path: '/api/planner/day?date=2026-11-09',
    });
    expect(day.status).toBe(200);
    expect(PLANNER_DAY.parse(day.body).date).toBe('2026-11-09');

    const made = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/alarms',
      body: {
        time: '07:00',
        days: [1, 2, 3, 4, 5],
        label: 'Work',
        targets: [{ kind: 'client', clientId: ready.clientId }],
      },
    });
    expect(made.status).toBe(200);
    const alarm = PLANNER_ALARM_ROW.parse(made.body);
    const change = await live.next(
      (message) => message.type === 'change' && message.table === 'planner_alarms',
    );
    expect(change).toMatchObject({ operation: 'INSERT', record: { id: alarm.id, time: '07:00' } });
    const summary = await live.next((message) => message.type === 'planner_summary');
    expect(summary).toMatchObject({ type: 'planner_summary', runningTimers: 0 });
    expect(summary).not.toMatchObject({ nextAlarmAt: null });

    const rings = await call(base, owner, {
      method: 'GET',
      path: `/api/planner/phone-rings?clientId=${ready.clientId}`,
    });
    expect(rings.status).toBe(200);
    expect(PLANNER_PHONE_RING_SET.parse(rings.body).rings).toEqual([
      expect.objectContaining({ kind: 'alarm', refId: alarm.id, label: 'Work' }),
    ]);

    const timer = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/timers',
      body: { duration_ms: 60_000 },
    });
    expect(PLANNER_TIMER_ROW.parse(timer.body).state).toBe('running');
    const stopwatch = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/stopwatch/start',
    });
    expect(PLANNER_STOPWATCH_ROW.parse(stopwatch.body).running).toBe(true);
    live.socket.close();
  });
});

describe('google wiring', () => {
  let booted: Booted | null = null;
  let directory: Awaited<ReturnType<typeof temporaryDirectory>> | null = null;

  afterEach(async () => {
    await booted?.server.stop();
    await directory?.remove();
    booted = null;
    directory = null;
  });

  it('links against the fake Google over HTTP and shows the live account row with its email', async () => {
    const google = createFakeGoogle();
    directory = await temporaryDirectory();
    booted = await bootServer(directory.path, {
      fetch: (input, init) =>
        google.fetch(input instanceof Request ? input.url : String(input), init ?? {}),
    });
    const { base, owner } = booted;
    const stored = await call(base, owner, {
      method: 'PUT',
      path: '/api/google/app',
      body: {
        androidClientId: 'android-client',
        desktopClientId: FAKE_CLIENT_ID,
        desktopClientSecret: FAKE_CLIENT_SECRET,
      },
    });
    expect(stored).toMatchObject({ status: 200, body: { ok: true } });
    const live = await openLive(base, owner);
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['google_accounts'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');
    const started = await call(base, owner, {
      method: 'POST',
      path: '/api/google/link/start',
      body: {
        platform: 'desktop',
        redirectUri: 'http://127.0.0.1:53682/callback',
        products: [
          { product: 'calendar', readOnly: false },
          { product: 'tasks', readOnly: false },
        ],
      },
    });
    expect(started.status).toBe(200);
    const { authUrl, state } = E.googleLinkStart.response.parse(started.body);
    const consent = google.oauth.consent(authUrl, 'ann@example.test');
    const finished = await call(base, owner, {
      method: 'POST',
      path: '/api/google/link/finish',
      body: { code: consent.code, state, redirectUri: 'http://127.0.0.1:53682/callback' },
    });
    expect(GOOGLE_ACCOUNT_ROW.parse(finished.body)).toMatchObject({
      email: 'ann@example.test',
      status: 'linked',
    });
    const change = await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'google_accounts' &&
        message.record?.status === 'linked',
    );
    expect(change).toMatchObject({ record: { email: 'ann@example.test' } });
    live.socket.close();
  });
});
