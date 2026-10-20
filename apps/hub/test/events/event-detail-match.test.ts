import {
  EVENT_KINDS,
  SIGNAL_SOURCES,
  kindSpecOf,
  miotDeviceEventsOf,
  type DeviceEvent,
  type EventKind,
  type JsonValue,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { SMARTTHINGS_EVENT_MAPPINGS, deviceEventsFor } from '@smarteverything/smartthings';
import { eventsOf, type DataPoint } from '@smarteverything/tuya';
import {
  deviceEventFromLegacyButton,
  deviceEventFromMiot,
  unspecifiedMiotEvent,
  type MiotEventShape,
} from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { CameraEventPoller } from '../../src/adapters/xiaomi/camera-events';
import { recorder } from '../xiaomi/harness';

const AT = '2026-10-18T10:00:00.000Z';
const OBSERVED = { externalId: 'd1', occurredAt: AT, details: { source: 'lan-push' } };

function xiaomiEvents(): DeviceEvent[] {
  const known = EVENT_KINDS.flatMap((kind) => miotDeviceEventsOf(kind));
  const camera = ['doorbell-ring', 'key-call-start', 'someone-appeared', 'pet-appeared'];
  const laundry = ['wash-end', 'wash-end-log', 'clean-completed'];
  const unmapped = ['brand-new-event', unspecifiedMiotEvent(2, 9).name];
  return [
    ...[...known, ...camera, ...laundry].map((name) => deviceEventFromMiot(name, OBSERVED)),
    ...unmapped.map((name) => deviceEventFromMiot(name, OBSERVED, { level: 3 })),
    deviceEventFromLegacyButton('event.click', OBSERVED),
  ];
}

function smartThingsEvents(): DeviceEvent[] {
  const mapped = Object.entries(SMARTTHINGS_EVENT_MAPPINGS).flatMap(([key, mapping]) => {
    const split = key.lastIndexOf('.');
    const capability = key.slice(0, split);
    const attribute = key.slice(split + 1);
    const values = mapping.values ?? Object.keys(mapping.summaries ?? { held: '' });
    return values.flatMap((value) =>
      deviceEventsFor({ deviceId: 'd1', componentId: 'main', capability, attribute, value }, AT),
    );
  });
  const passed = deviceEventsFor(
    {
      deviceId: 'd1',
      componentId: 'main',
      capability: 'lock',
      attribute: 'lock',
      value: 'unlocked',
      data: { method: 'keypad' },
    },
    AT,
    undefined,
    true,
  );
  return [...mapped, ...passed];
}

function point(code: string): DataPoint {
  return {
    code,
    dpId: null,
    name: null,
    readable: true,
    writable: false,
    shape: { type: 'Raw', maxLength: 255 },
  };
}

function tuyaEvents(): DeviceEvent[] {
  const report = [
    { code: 'pir', value: 'pir' },
    { code: 'watersensor_state', value: 'alarm' },
    { code: 'gas_sensor_status', value: 'alarm' },
    { code: 'doorbell_active', value: 'url' },
    { code: 'switch2_value', value: 'click' },
    { code: 'temper_alarm', value: 'alarm' },
  ];
  return [
    ...eventsOf(
      'd1',
      report,
      AT,
      report.map((entry) => point(entry.code)),
    ),
  ];
}

async function cameraEvents(): Promise<DeviceEvent[]> {
  const base = Date.parse(AT);
  const recorded = recorder();
  const poller = new CameraEventPoller(
    { did: 'cam', model: 'xiaomi.camera.test', doorbell: false },
    {
      cameraEvents: (): Promise<JsonValue> =>
        Promise.resolve({
          thirdPartPlayUnits: [
            {
              createTime: base + 1,
              eventType: 'PeopleMotion:Mystery',
              fileId: 'f1',
              imgStoreId: 'i1',
            },
            { createTime: base + 2, eventType: 'ObjectMotion' },
          ],
        }),
    },
    () => base,
    new Logger('tool.event-detail-test'),
  );
  await poller.fetch(recorded.sink);
  return recorded.events;
}

function isStructured(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null;
}

function matchable(kind: EventKind, key: string, value: JsonValue): boolean {
  const entry = kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind })?.match.find(
    (candidate) => candidate.key === key,
  );
  return entry !== undefined && (entry.values === null || entry.values.some((v) => v === value));
}

function matchKeys(kind: EventKind): string[] {
  return (kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind })?.match ?? []).map(
    (entry) => entry.key,
  );
}

describe('every scalar detail a provider event carries can be matched by an automation', () => {
  it('holds for Xiaomi, SmartThings, Tuya and camera event lists', async () => {
    const events = [
      ...xiaomiEvents(),
      ...smartThingsEvents(),
      ...tuyaEvents(),
      ...(await cameraEvents()),
    ];
    expect(events.length).toBeGreaterThan(40);
    const missing = events.flatMap((event) =>
      Object.entries(event.details)
        .filter(([, value]) => !isStructured(value))
        .filter(([key, value]) => !matchable(event.kind, key, value))
        .map(([key]) => `${event.kind}.${key}`),
    );
    expect([...new Set(missing)]).toStrictEqual([]);
  });

  it('lists no match key twice on one event kind', () => {
    for (const kind of EVENT_KINDS) {
      const keys = matchKeys(kind);
      expect(new Set(keys).size, kind).toBe(keys.length);
    }
  });

  it('turns every provider-side name that has no mapping into an activity event carrying it', async () => {
    const shape: MiotEventShape = unspecifiedMiotEvent(4, 2);
    expect(deviceEventFromMiot(shape.name, OBSERVED).details).toMatchObject({
      event: shape.name,
      miotEvent: shape.name,
    });
    expect(tuyaEvents().find((event) => event.details['code'] === 'temper_alarm')).toMatchObject({
      kind: 'activity',
    });
    const camera = await cameraEvents();
    expect(camera.filter((event) => event.kind === 'activity')).toHaveLength(1);
    expect(camera.every((event) => event.details['hasClip'] !== undefined)).toBe(true);
  });
});
