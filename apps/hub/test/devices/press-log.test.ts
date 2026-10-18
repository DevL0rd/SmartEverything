import { TEST_AUTHOR } from '../support/automation-author';
import type { AutomationV2, DeviceRow, EventKind, EventRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDeviceLog } from '../../src/devices/device-log/read';
import { pressDeviceButton, recordRefill } from '../../src/devices/press';
import type { RunningHub } from '../../src/hub';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { addDevice, addPerson, clockAt } from './log-fixture';

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

function addButton(name = 'Kitchen switch'): DeviceRow {
  return addDevice(opened.store, {
    externalId: `switch-${name}`,
    kind: 'other',
    name,
    model: 'lumi.sensor_switch.v2',
    capabilities: [],
  });
}

function pressAt(deviceId: string, at: string, details: Record<string, string> = {}): EventRow {
  const [row] = opened.store.events.insert([
    {
      deviceId,
      kind: 'button',
      occurredAt: at,
      details: { action: 'single_press', source: 'lan-push', ...details },
    },
  ]);
  if (row === undefined) throw new Error('No event was stored.');
  return row;
}

function reacting(name: string, button: DeviceRow, action: string, enabled = true): string {
  const when: AutomationV2['when'] = [
    { on: 'signal', source: 'event', kind: 'button', subject: button.id, match: { action } },
  ];
  const created = opened.store.automations.create({
    name,
    enabled,
    definition: { when, steps: [{ do: 'wait', ms: 1000 }] },
    origin: null,
    author: TEST_AUTHOR,
  });
  return created.id;
}

function runOf(
  automationId: string,
  at: string,
  status: 'succeeded' | 'failed' | 'ignored' | 'running',
): void {
  clock.set(at);
  const run = opened.store.automationRuns.create({
    automationId,
    revision: 1,
    ownerProfileId: null,
  });
  opened.store.automationRuns.update(run.id, { status });
}

type RecordedEvent = Parameters<RunningHub['recordEvent']>[0];

function storeEvent(event: RecordedEvent, occurredAt: string): Promise<string> {
  const [row] = opened.store.events.insert([{ ...event, occurredAt }]);
  if (row === undefined) throw new Error('No event was stored.');
  return Promise.resolve(row.id);
}

function appCaller(clientId: string): Caller {
  return { kind: 'client', client: opened.store.clients.byId(clientId) };
}

function log(device: DeviceRow, limit = 20): ReturnType<typeof readDeviceLog> {
  return readDeviceLog(opened.store, { device, to: undefined, limit, tier: null });
}

describe('the press log of a wireless button', () => {
  it('lists each press with the automations it ran and how they ended', () => {
    const button = addButton();
    const brighter = reacting('Kitchen brighter', button, 'single_press');
    const lightsOff = reacting('Kitchen lights off', button, 'single_press');
    reacting('Kitchen dimmer', button, 'long_press');
    reacting('Disabled helper', button, 'single_press', false);
    pressAt(button.id, '2026-10-17T10:30:00.000Z');
    runOf(brighter, '2026-10-17T10:30:01.000Z', 'succeeded');
    runOf(lightsOff, '2026-10-17T10:30:02.000Z', 'failed');
    expect(log(button)).toEqual([
      {
        at: '2026-10-17T10:30:00.000Z',
        kind: 'press',
        title: 'Pressed',
        cause: { kind: 'button', id: button.id, name: 'Kitchen switch' },
        effects: [
          { title: 'Kitchen brighter', automationId: brighter, outcome: 'ok' },
          { title: 'Kitchen lights off', automationId: lightsOff, outcome: 'failed' },
        ],
      },
    ]);
  });

  it('words each gesture and shows no effects when nothing reacted', () => {
    const button = addButton();
    pressAt(button.id, '2026-10-17T10:00:00.000Z', { action: 'double_press' });
    pressAt(button.id, '2026-10-17T10:01:00.000Z', { action: 'long_press' });
    pressAt(button.id, '2026-10-17T10:01:02.000Z', { action: 'release' });
    expect(log(button).map((entry) => [entry.title, entry.effects])).toEqual([
      ['Released', undefined],
      ['Held', undefined],
      ['Double-pressed', undefined],
    ]);
  });

  it('does not credit an automation that ran long after the press', () => {
    const button = addButton();
    const brighter = reacting('Kitchen brighter', button, 'single_press');
    pressAt(button.id, '2026-10-17T10:30:00.000Z');
    runOf(brighter, '2026-10-17T10:30:20.000Z', 'succeeded');
    expect(log(button)[0]?.effects).toBeUndefined();
  });

  it('shows a run still in progress as running and a skipped one as skipped', () => {
    const button = addButton();
    const slow = reacting('Slow scene', button, 'single_press');
    const guarded = reacting('Guarded scene', button, 'single_press');
    pressAt(button.id, '2026-10-17T10:30:00.000Z');
    runOf(slow, '2026-10-17T10:30:01.000Z', 'running');
    runOf(guarded, '2026-10-17T10:30:01.500Z', 'ignored');
    expect(log(button)[0]?.effects?.map((effect) => effect.outcome)).toEqual([
      'skipped',
      'running',
    ]);
  });
});

describe('pressing a button from the app', () => {
  const recorded: RecordedEvent[] = [];

  function context(): Parameters<typeof pressDeviceButton>[0] {
    recorded.length = 0;
    return {
      store: opened.store,
      hub: {
        recordEvent: (event): Promise<string> => {
          recorded.push(event);
          return storeEvent(event, clock.now().toISOString());
        },
      },
    };
  }

  it('records the press for the person and lists exactly the automations that react to it', async () => {
    const { client } = addPerson(opened.store, 'Dana');
    const button = addButton();
    const brighter = reacting('Kitchen brighter', button, 'single_press');
    reacting('Kitchen dimmer', button, 'long_press');
    const outcome = await pressDeviceButton(
      context(),
      button,
      'single_press',
      appCaller(client.id),
    );
    expect(outcome).toEqual({ automations: [{ id: brighter, name: 'Kitchen brighter' }] });
    expect(recorded).toEqual([
      {
        deviceId: button.id,
        kind: 'button' satisfies EventKind,
        details: { action: 'single_press', source: 'app', requestedBy: client.id },
      },
    ]);
    expect(log(button)[0]).toMatchObject({
      title: 'Pressed',
      cause: { kind: 'app', name: 'Dana' },
    });
  });

  it('refuses a device that is not a wireless button', async () => {
    const { client } = addPerson(opened.store, 'Dana');
    const plug = addDevice(opened.store);
    await expect(
      pressDeviceButton(context(), plug, 'single_press', appCaller(client.id)),
    ).rejects.toThrow('is not a wireless button');
    expect(recorded).toEqual([]);
  });
});

describe('refilling a scent diffuser', () => {
  const diffuser = (): DeviceRow =>
    addDevice(opened.store, {
      externalId: 'diffuser-1',
      kind: 'other',
      name: 'Bedroom diffuser',
      model: 'xiaomi.diffuser.xw2iv',
      capabilities: [],
    });

  it('puts the refill in the device log under the person who said so', async () => {
    const { client } = addPerson(opened.store, 'Dana');
    const device = diffuser();
    await recordRefill(
      {
        store: opened.store,
        hub: {
          recordEvent: (event): Promise<string> => storeEvent(event, '2026-10-17T11:00:00.000Z'),
        },
      },
      device,
      appCaller(client.id),
    );
    expect(log(device)).toEqual([
      {
        at: '2026-10-17T11:00:00.000Z',
        kind: 'event',
        title: 'Refilled',
        cause: { kind: 'app', name: 'Dana' },
      },
    ]);
  });

  it('keeps the refill date in the household settings so every person sees it', async () => {
    const { client } = addPerson(opened.store, 'Dana');
    const other = addPerson(opened.store, 'Sam').client;
    const device = diffuser();
    const context = {
      store: opened.store,
      hub: {
        recordEvent: (event: RecordedEvent): Promise<string> =>
          storeEvent(event, '2026-10-17T11:00:00.000Z'),
      },
    };
    await recordRefill(context, device, appCaller(client.id));
    clock.set('2026-10-18T09:30:00.000Z');
    await recordRefill(context, device, appCaller(other.id));
    expect(opened.store.settings.read().device_refills).toEqual({
      [device.id]: '2026-10-18T09:30:00.000Z',
    });
  });
});
