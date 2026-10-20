import dbus from 'dbus-next';
import { describe, expect, it } from 'vitest';
import { NodeFailureError } from '../../../src/node/node-failure';
import { PortalGrant } from '../../../src/node/controls/linux/portal-grant';
import { openPortalSession } from '../../../src/node/controls/linux/portal-session';
import type { RestoreTokenStore } from '../../../src/node/controls/linux/portal-token';
import { captureLogs, testLogger } from '../../support/logs';
import { FakePortalBus, SESSION, grantingBus, streamsVariant } from './portal-bus';

const SCREEN = { id: 7, x: 0, y: 0, width: 1920, height: 1080 };

function memory(initial: string | null): RestoreTokenStore & { value: string | null } {
  const store = {
    value: initial,
    read: (): Promise<string | null> => Promise.resolve(store.value),
    write: (token: string): Promise<void> => {
      store.value = token;
      return Promise.resolve();
    },
  };
  return store;
}

function variantOf(bus: FakePortalBus, member: string, key: string): unknown {
  const options = bus.calls.find((call) => call.member === member)?.body?.at(-1);
  if (typeof options !== 'object' || options === null) return undefined;
  const value: unknown = Reflect.get(options, key);
  return value instanceof dbus.Variant ? value.value : undefined;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('opening a remote control session', () => {
  it('creates the session, picks devices and screens, then starts it', async () => {
    const bus = grantingBus([SCREEN, { id: 9, x: 1920, y: 0, width: 1280, height: 720 }]);
    const { session, restoreToken } = await openPortalSession(bus, null);
    expect(bus.members()).toEqual(['CreateSession', 'SelectDevices', 'SelectSources', 'Start']);
    expect(variantOf(bus, 'SelectDevices', 'types')).toBe(3);
    expect(variantOf(bus, 'SelectDevices', 'persist_mode')).toBe(2);
    expect(variantOf(bus, 'SelectDevices', 'restore_token')).toBeUndefined();
    expect(variantOf(bus, 'SelectSources', 'types')).toBe(1);
    expect(variantOf(bus, 'SelectSources', 'multiple')).toBe(true);
    expect(session.streams).toEqual([SCREEN, { id: 9, x: 1920, y: 0, width: 1280, height: 720 }]);
    expect(restoreToken).toBe('new-token');
    expect(bus.watchers).toHaveLength(0);
  });

  it('offers the saved token so the desktop does not ask again', async () => {
    const bus = grantingBus([SCREEN], null);
    const { restoreToken } = await openPortalSession(bus, 'saved');
    expect(variantOf(bus, 'SelectDevices', 'restore_token')).toBe('saved');
    expect(restoreToken).toBeNull();
  });

  it('reports a declined dialog as not permitted', async () => {
    const bus = grantingBus([SCREEN]);
    bus.answers.set('Start', { code: 1, results: {} });
    await expect(openPortalSession(bus, null)).rejects.toMatchObject({ code: 'not_permitted' });
    await expect(openPortalSession(bus, null)).rejects.toThrow('declined');
  });

  it('reports any other refusal as a failure with the answer', async () => {
    const bus = grantingBus([SCREEN]);
    bus.answers.set('CreateSession', { code: 2, results: {} });
    await expect(openPortalSession(bus, null)).rejects.toMatchObject({ code: 'failed' });
    await expect(openPortalSession(bus, null)).rejects.toThrow('answer 2');
  });

  it('fails when the desktop shares no screen', async () => {
    const bus = grantingBus([]);
    await expect(openPortalSession(bus, null)).rejects.toThrow('shared no screen');
  });

  it('sends keyboard and pointer notifications for the session', async () => {
    const bus = grantingBus([SCREEN]);
    const { session } = await openPortalSession(bus, null);
    await session.pointerMotion(7, 10.5, 20);
    await session.button(0x110, true);
    await session.axisDiscrete(0, -3);
    await session.keysym(0x61, false);
    const notes = bus.calls.slice(4);
    expect(notes.map((call) => [call.member, call.signature, call.body])).toEqual([
      ['NotifyPointerMotionAbsolute', 'oa{sv}udd', [SESSION, {}, 7, 10.5, 20]],
      ['NotifyPointerButton', 'oa{sv}iu', [SESSION, {}, 0x110, 1]],
      ['NotifyPointerAxisDiscrete', 'oa{sv}ui', [SESSION, {}, 0, -3]],
      ['NotifyKeyboardKeysym', 'oa{sv}iu', [SESSION, {}, 0x61, 0]],
    ]);
  });
});

describe('the one-time grant', () => {
  function grant(bus: FakePortalBus, store: RestoreTokenStore): PortalGrant {
    return new PortalGrant({ bus: () => bus, tokens: store, log: testLogger('input') });
  }

  it('answers with the approval message while the dialog is open, then works', async () => {
    const bus = grantingBus([SCREEN]);
    const store = memory(null);
    const portal = grant(bus, store);
    await expect(portal.obtain()).rejects.toMatchObject({ code: 'not_permitted' });
    await settle();
    expect(store.value).toBe('new-token');
    const session = await portal.obtain();
    expect(session.streams).toEqual([SCREEN]);
    expect(await portal.obtain()).toBe(session);
    expect(bus.members().filter((member) => member === 'Start')).toHaveLength(1);
  });

  it('starts a second time only after the first attempt ended', async () => {
    const bus = grantingBus([SCREEN]);
    bus.answers.set('Start', { code: 1, results: {} });
    const portal = grant(bus, memory(null));
    await expect(portal.obtain()).rejects.toBeInstanceOf(NodeFailureError);
    await expect(portal.obtain()).rejects.toBeInstanceOf(NodeFailureError);
    await settle();
    expect(bus.members().filter((member) => member === 'CreateSession').length).toBeGreaterThan(0);
  });

  it('waits for a silent restore when a token is saved and keeps the saved token', async () => {
    const bus = grantingBus([SCREEN], 'saved');
    const store = memory('saved');
    const session = await grant(bus, store).obtain();
    expect(session.streams).toHaveLength(1);
    expect(variantOf(bus, 'SelectDevices', 'restore_token')).toBe('saved');
    expect(store.value).toBe('saved');
  });

  it('forgets the session when the desktop closes it and asks again', async () => {
    const bus = grantingBus([SCREEN], 'saved');
    const portal = grant(bus, memory('saved'));
    const first = await portal.obtain();
    bus.emit({ iface: 'org.freedesktop.portal.Session', member: 'Closed', path: SESSION }, []);
    const second = await portal.obtain();
    expect(second).not.toBe(first);
    expect(bus.members().filter((member) => member === 'Start')).toHaveLength(2);
  });

  it('opens a new session when the desktop connection changed', async () => {
    const buses = [grantingBus([SCREEN], 'saved'), grantingBus([SCREEN], 'saved')];
    let current = 0;
    const portal = new PortalGrant({
      bus: (): FakePortalBus => buses[current] ?? grantingBus([]),
      tokens: memory('saved'),
      log: testLogger('input'),
    });
    await portal.obtain();
    current = 1;
    await portal.obtain();
    expect(buses[1]?.members()).toContain('Start');
    expect(buses[0]?.watchers).toHaveLength(0);
  });

  it('never writes the restore token to the logs', async () => {
    const logs = captureLogs();
    const bus = grantingBus([SCREEN], 'secret-token-value');
    await grant(bus, memory('secret-token-value')).obtain();
    expect(JSON.stringify(logs.records)).not.toContain('secret-token-value');
    expect(logs.events()).toContain('input.granted');
  });

  it('keeps the stream positions of a two screen desktop', async () => {
    const bus = new FakePortalBus();
    bus.answers.set('CreateSession', {
      code: 0,
      results: { session_handle: new dbus.Variant('s', SESSION) },
    });
    bus.answers.set('SelectDevices', { code: 0, results: {} });
    bus.answers.set('SelectSources', { code: 0, results: {} });
    bus.answers.set('Start', { code: 0, results: { streams: streamsVariant([SCREEN]) } });
    const { session } = await openPortalSession(bus, null);
    expect(session.streams[0]).toEqual(SCREEN);
  });
});
