import { describe, expect, it, vi } from 'vitest';
import type { AdapterSink, JsonValue } from '@smarteverything/domain';
import {
  notificationSnapshot,
  readingsChanged,
  shellyEvents,
} from '../../../src/plugins/builtin/shelly-presence/notifications';
import type { ShellyNotification } from '@smarteverything/shelly/rpc';
import { projectShellyReadings } from '../../../src/plugins/builtin/shelly-presence/projector';
import { sensorFixture } from './sensor-fixture';

function notification(
  method: string,
  params: Readonly<Record<string, JsonValue>>,
): ShellyNotification {
  return { src: 'x', method, params, sequence: 1 };
}

describe('Shelly notification merge', () => {
  it('touches only the components a status delta names', () => {
    const before = sensorFixture();
    const frame = notification('NotifyStatus', { ts: 5, 'illuminance:0': { lux: 90 } });
    const after = notificationSnapshot(before, frame, [], true);
    expect(after.light[0]?.status?.lux).toBe(90);
    expect(after.zones).toBe(before.zones);
    expect(after.components).toBe(before.components);
    expect(after.status).toBe(before.status);
  });

  it('leaves every reading untouched for track frames', () => {
    const before = sensorFixture();
    const frame = notification('NotifyEvent', {
      events: [
        { component: 'presence', event: 'track', ts: 5, object: [{ id: 1, x: 1, y: 1, z: 1 }] },
      ],
    });
    const events = shellyEvents(frame);
    const after = notificationSnapshot(before, frame, events, true);
    expect(after.tracks).toHaveLength(1);
    expect(readingsChanged(before, after)).toBe(false);
  });

  it('drops events it cannot read and keeps the others', () => {
    const frame = notification('NotifyEvent', {
      events: [
        { component: 1, event: 'broken' },
        { component: 'presencezone:200', event: 'enter', ts: 9, extra: { deep: true } },
      ],
    });
    expect(shellyEvents(frame).map((event) => event.event)).toEqual(['enter']);
  });
});

describe('Shelly reading projection', () => {
  it('writes only the zone whose status changed', () => {
    const before = sensorFixture();
    const frame = notification('NotifyStatus', {
      ts: 5,
      'presencezone:201': { value: true, num_objects: 2 },
    });
    const after = notificationSnapshot(before, frame, [], true);
    const state = vi.fn<AdapterSink['state']>();
    const sink: AdapterSink = {
      state,
      event: vi.fn(),
      online: vi.fn(),
      devices: vi.fn(),
      failure: vi.fn(),
    };
    projectShellyReadings(sink, after, before);
    expect(state.mock.calls.map(([update]) => update.capability)).toEqual([
      'occupancy',
      'object_count',
    ]);
    expect(state.mock.calls.every(([update]) => update.externalId.endsWith('201'))).toBe(true);
  });
});
