import { TEST_AUTHOR } from '../support/automation-author';
import type { AutomationV2 } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDeviceLog } from '../../src/devices/device-log/read';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { addDevice, addPerson, clockAt, POWER } from './log-fixture';

let opened: TestStore;
const clock = clockAt('2026-10-17T10:00:00.000Z');

beforeEach(async () => {
  captureLogs();
  clock.set('2026-10-17T10:00:00.000Z');
  opened = await testStore(clock.now);
});

afterEach(async () => {
  await opened.close();
});

function setState(deviceId: string, capability: string, value: boolean, at: string): void {
  opened.store.state.write([{ deviceId, capability, value, observedAt: at }]);
}

function log(deviceId: string, limit = 20, to?: string): ReturnType<typeof readDeviceLog> {
  const device = opened.store.devices.byId(deviceId);
  return readDeviceLog(opened.store, { device, to, limit, tier: null });
}

function automationOn(name: string, when: AutomationV2['when']): string {
  return opened.store.automations.create({
    name,
    enabled: true,
    definition: { when, steps: [{ do: 'wait', ms: 1000 }] },
    origin: null,
    author: TEST_AUTHOR,
  }).id;
}

describe('the cause of a state change', () => {
  it('names the person whose app sent the command', () => {
    const { store } = opened;
    const { client } = addPerson(store, 'Dana');
    const plug = addDevice(store);
    setState(plug.id, 'power', false, '2026-10-17T10:00:00.000Z');
    clock.set('2026-10-17T10:05:00.000Z');
    store.commands.insert([
      {
        deviceId: plug.id,
        capability: 'power',
        value: true,
        source: 'app',
        requestedBy: client.id,
      },
    ]);
    setState(plug.id, 'power', true, '2026-10-17T10:05:02.000Z');
    expect(log(plug.id)).toEqual([
      {
        at: '2026-10-17T10:05:02.000Z',
        kind: 'change',
        title: 'Turned on',
        cause: { kind: 'app', name: 'Dana' },
      },
    ]);
  });

  it('says the assistant did it when the command came from the assistant', () => {
    const { store } = opened;
    const plug = addDevice(store);
    setState(plug.id, 'power', true, '2026-10-17T10:00:00.000Z');
    clock.set('2026-10-17T10:05:00.000Z');
    store.commands.insert([
      {
        deviceId: plug.id,
        capability: 'power',
        value: false,
        source: 'assistant',
        requestedBy: null,
      },
    ]);
    setState(plug.id, 'power', false, '2026-10-17T10:05:03.000Z');
    expect(log(plug.id)[0]).toMatchObject({ title: 'Turned off', cause: { kind: 'assistant' } });
  });

  it('names the automation behind an automation command and calls a clock-only one a schedule', () => {
    const { store } = opened;
    const plug = addDevice(store);
    const nightly = automationOn('Lights out', [{ on: 'time', at: '23:00' }]);
    const hallway = automationOn('Hallway motion', [
      { on: 'signal', source: 'event', kind: 'motion', subject: plug.id },
    ]);
    setState(plug.id, 'power', true, '2026-10-17T10:00:00.000Z');
    for (const [automationId, at, value] of [
      [nightly, '2026-10-17T10:10:00.000Z', false],
      [hallway, '2026-10-17T10:20:00.000Z', true],
    ] as const) {
      clock.set(at);
      const [command] = store.commands.insert([
        { deviceId: plug.id, capability: 'power', value, source: 'automation', requestedBy: null },
      ]);
      const run = store.automationRuns.create({ automationId, revision: 1, ownerProfileId: null });
      if (command === undefined) throw new Error('No command was stored.');
      store.automationRuns.retainCommands(run.id, [command]);
      setState(plug.id, 'power', value, new Date(Date.parse(at) + 1000).toISOString());
    }
    expect(log(plug.id).map((entry) => entry.cause)).toEqual([
      { kind: 'automation', name: 'Hallway motion', id: hallway },
      { kind: 'schedule', name: 'Lights out', id: nightly },
    ]);
  });

  it('credits a wireless button when the automation that ran was triggered by its press', () => {
    const { store } = opened;
    const plug = addDevice(store);
    const button = addDevice(store, {
      externalId: 'switch-1',
      kind: 'other',
      name: 'Kitchen switch',
      model: 'lumi.sensor_switch.v2',
      capabilities: [],
    });
    const brighter = automationOn('Kitchen brighter', [
      {
        on: 'signal',
        source: 'event',
        kind: 'button',
        subject: button.id,
        match: { action: 'single_press' },
      },
    ]);
    setState(plug.id, 'power', false, '2026-10-17T10:00:00.000Z');
    store.events.insert([
      {
        deviceId: button.id,
        kind: 'button',
        occurredAt: '2026-10-17T10:30:00.000Z',
        details: { action: 'single_press' },
      },
    ]);
    clock.set('2026-10-17T10:30:01.000Z');
    const [command] = store.commands.insert([
      {
        deviceId: plug.id,
        capability: 'power',
        value: true,
        source: 'automation',
        requestedBy: null,
      },
    ]);
    const run = store.automationRuns.create({
      automationId: brighter,
      revision: 1,
      ownerProfileId: null,
    });
    if (command === undefined) throw new Error('No command was stored.');
    store.automationRuns.retainCommands(run.id, [command]);
    setState(plug.id, 'power', true, '2026-10-17T10:30:02.000Z');
    expect(log(plug.id)[0]?.cause).toEqual({
      kind: 'button',
      id: button.id,
      name: 'Kitchen switch',
    });
  });

  it('says it happened on the device for a plug nothing sent a command to, and unknown for a light', () => {
    const { store } = opened;
    const plug = addDevice(store);
    const lamp = addDevice(store, { externalId: 'lamp-1', kind: 'light', name: 'Lamp' });
    for (const device of [plug, lamp]) {
      setState(device.id, 'power', false, '2026-10-17T10:00:00.000Z');
      setState(device.id, 'power', true, '2026-10-17T10:40:00.000Z');
    }
    expect(log(plug.id)[0]?.cause).toEqual({ kind: 'device' });
    expect(log(lamp.id)[0]?.cause).toEqual({ kind: 'unknown' });
  });

  it('ignores a command that failed, was for another capability or came too long before', () => {
    const { store } = opened;
    const plug = addDevice(store, { capabilities: [POWER] });
    setState(plug.id, 'power', false, '2026-10-17T10:00:00.000Z');
    clock.set('2026-10-17T10:50:00.000Z');
    const [stale] = store.commands.insert([
      { deviceId: plug.id, capability: 'power', value: true, source: 'app', requestedBy: null },
    ]);
    if (stale === undefined) throw new Error('No command was stored.');
    store.commands.finish(stale.id, { status: 'failed', error: 'offline' });
    setState(plug.id, 'power', true, '2026-10-17T10:50:05.000Z');
    expect(log(plug.id)[0]?.cause).toEqual({ kind: 'device' });
  });

  it('leaves out the first thing the hub ever saw because nothing changed', () => {
    const { store } = opened;
    const plug = addDevice(store);
    setState(plug.id, 'power', true, '2026-10-17T10:00:00.000Z');
    expect(log(plug.id)).toEqual([]);
  });
});

describe('the log of sensors', () => {
  it('words a presence phone as home and away and says the device reported it', () => {
    const { store } = opened;
    const phone = addDevice(store, {
      externalId: 'presence-1',
      kind: 'other',
      name: 'Dana phone',
      model: 'SmartThings-smartthings-Mobile_Presence',
      capabilities: [
        { key: 'occupancy', label: 'Presence', access: 'read', value: { kind: 'boolean' } },
      ],
    });
    setState(phone.id, 'occupancy', true, '2026-10-17T10:00:00.000Z');
    setState(phone.id, 'occupancy', false, '2026-10-17T12:00:00.000Z');
    setState(phone.id, 'occupancy', true, '2026-10-17T17:40:00.000Z');
    expect(log(phone.id).map((entry) => [entry.at, entry.title, entry.cause.kind])).toEqual([
      ['2026-10-17T17:40:00.000Z', 'Home', 'device'],
      ['2026-10-17T12:00:00.000Z', 'Away', 'device'],
    ]);
  });
});

describe('paging the log', () => {
  it('returns the newest first, limited, and continues before the oldest entry', () => {
    const { store } = opened;
    const plug = addDevice(store);
    setState(plug.id, 'power', false, '2026-10-17T10:00:00.000Z');
    for (let minute = 1; minute <= 5; minute += 1) {
      setState(plug.id, 'power', minute % 2 === 1, `2026-10-17T10:0${String(minute)}:00.000Z`);
    }
    const firstPage = log(plug.id, 2);
    expect(firstPage.map((entry) => entry.at)).toEqual([
      '2026-10-17T10:05:00.000Z',
      '2026-10-17T10:04:00.000Z',
    ]);
    const second = log(plug.id, 2, firstPage[1]?.at);
    expect(second.map((entry) => entry.at)).toEqual([
      '2026-10-17T10:03:00.000Z',
      '2026-10-17T10:02:00.000Z',
    ]);
  });
});
