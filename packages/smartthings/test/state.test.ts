import { describe, expect, it } from 'vitest';
import { mapDevice } from '../src/device-mapping';
import type { SmartThingsDeviceEvent } from '../src/webhook-messages';
import { DEVICE } from '../src/rest-schemas';
import {
  deviceEventsFor,
  isOnlineHealth,
  statesForEvent,
  statesOf,
  withEvent,
  type DeviceState,
} from '../src/state';

const AT = '2026-10-08T12:00:00.000Z';

function light(): ReturnType<typeof mapDevice> {
  return mapDevice(
    DEVICE.parse({
      deviceId: 'light-1',
      label: 'Lamp',
      manufacturerName: 'Lumen',
      locationId: 'l',
      components: [
        {
          id: 'main',
          categories: [],
          capabilities: [
            { id: 'switch', status: { switch: { value: 'on' } } },
            { id: 'switchLevel', status: { level: { value: 40, unit: '%' } } },
            { id: 'colorControl', status: { hue: { value: 50 }, saturation: { value: 100 } } },
            { id: 'battery' },
          ],
        },
        { id: 'night', categories: [], capabilities: [{ id: 'switch' }] },
      ],
    }),
    { rooms: new Map(), definitions: new Map() },
  );
}

function lightState(): DeviceState {
  const mapped = light();
  return { externalId: 'light-1', bindings: mapped.bindings, status: mapped.status };
}

function eventOf(overrides: Partial<SmartThingsDeviceEvent>): SmartThingsDeviceEvent {
  return {
    deviceId: 'light-1',
    componentId: 'main',
    capability: 'switch',
    attribute: 'switch',
    value: 'off',
    ...overrides,
  };
}

describe('device state', () => {
  it('reports every value the status holds, and nothing for what it does not', () => {
    expect(statesOf(lightState(), AT)).toEqual([
      { externalId: 'light-1', capability: 'power', value: true, observedAt: AT },
      { externalId: 'light-1', capability: 'brightness', value: 40, observedAt: AT },
      {
        externalId: 'light-1',
        capability: 'color',
        value: { hue: 180, saturation: 100, value: 40 },
        observedAt: AT,
      },
    ]);
  });

  it('applies an event to the status, keeping the unit it already had', () => {
    const status = withEvent(
      lightState().status,
      eventOf({ capability: 'switchLevel', attribute: 'level', value: 70 }),
    );
    expect(status['main']?.['switchLevel']?.['level']).toEqual({ value: 70, unit: '%' });
    expect(status['main']?.['switch']).toEqual({ switch: { value: 'on' } });
    expect(lightState().status['main']?.['switchLevel']?.['level']).toEqual({
      value: 40,
      unit: '%',
    });
  });

  it('takes the unit an event carries, and adds components and capabilities it has not seen', () => {
    const status = withEvent(
      {},
      eventOf({
        componentId: 'night',
        capability: 'battery',
        attribute: 'battery',
        value: 9,
        unit: '%',
      }),
    );
    expect(status).toEqual({ night: { battery: { battery: { value: 9, unit: '%' } } } });
    expect(withEvent({}, eventOf({}))).toEqual({
      main: { switch: { switch: { value: 'off', unit: null } } },
    });
  });

  it('reports only the capabilities an event touches, recomputing ones built from several attributes', () => {
    const event = eventOf({ capability: 'switchLevel', attribute: 'level', value: 80 });
    const updated = { ...lightState(), status: withEvent(lightState().status, event) };
    expect(statesForEvent(updated, event, AT)).toEqual([
      { externalId: 'light-1', capability: 'brightness', value: 80, observedAt: AT },
      {
        externalId: 'light-1',
        capability: 'color',
        value: { hue: 180, saturation: 100, value: 80 },
        observedAt: AT,
      },
    ]);
  });

  it('matches events to the component they came from', () => {
    const event = eventOf({ componentId: 'night', value: 'on' });
    const updated = { ...lightState(), status: withEvent(lightState().status, event) };
    expect(statesForEvent(updated, event, AT)).toEqual([
      { externalId: 'light-1', capability: 'raw:night-power', value: true, observedAt: AT },
    ]);
    expect(
      statesForEvent(updated, eventOf({ componentId: 'night', attribute: 'other' }), AT),
    ).toEqual([]);
    expect(
      statesForEvent(updated, eventOf({ componentId: 'night', capability: 'other' }), AT),
    ).toEqual([]);
  });

  it('reports nothing for a binding whose component has no status yet', () => {
    expect(statesOf({ ...lightState(), status: {} }, AT)).toEqual([]);
  });
});

describe('device events', () => {
  it('reports button presses whatever their value', () => {
    expect(
      deviceEventsFor(eventOf({ capability: 'button', attribute: 'button', value: 'held' }), AT),
    ).toEqual([
      {
        externalId: 'light-1',
        kind: 'button',
        occurredAt: AT,
        details: { component: 'main', value: 'held' },
      },
    ]);
    expect(
      deviceEventsFor(
        eventOf({ capability: 'button', attribute: 'numberOfButtons', value: 2 }),
        AT,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(eventOf({ capability: 'other', attribute: 'button', value: 'held' }), AT),
    ).toEqual([]);
  });

  it('reports motion, leaks and smoke when they are detected', () => {
    const cases = [
      ['motionSensor', 'motion', 'active', 'motion'],
      ['waterSensor', 'water', 'wet', 'leak'],
      ['smokeDetector', 'smoke', 'detected', 'smoke'],
      ['smokeDetector', 'smoke', 'tested', 'smoke'],
    ] as const;
    for (const [capability, attribute, value, kind] of cases) {
      expect(deviceEventsFor(eventOf({ capability, attribute, value }), AT)).toEqual([
        { externalId: 'light-1', kind, occurredAt: AT, details: { component: 'main', value } },
      ]);
    }
  });

  it('reports nothing when the alarm clears, for other attributes, or for non-text values', () => {
    expect(
      deviceEventsFor(
        eventOf({ capability: 'motionSensor', attribute: 'motion', value: 'inactive' }),
        AT,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(
        eventOf({ capability: 'motionSensor', attribute: 'other', value: 'active' }),
        AT,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(
        eventOf({ capability: 'waterSensor', attribute: 'motion', value: 'active' }),
        AT,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(eventOf({ capability: 'motionSensor', attribute: 'motion', value: 1 }), AT),
    ).toEqual([]);
  });

  it('reports nothing for an event that did not change the state', () => {
    expect(
      deviceEventsFor(
        eventOf({
          capability: 'motionSensor',
          attribute: 'motion',
          value: 'active',
          stateChange: false,
        }),
        AT,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(
        eventOf({
          capability: 'motionSensor',
          attribute: 'motion',
          value: 'active',
          stateChange: true,
        }),
        AT,
      ),
    ).toHaveLength(1);
  });

  it('reads a health status as online or offline', () => {
    expect(isOnlineHealth('ONLINE')).toBe(true);
    expect(isOnlineHealth('UNHEALTHY')).toBe(false);
  });
});
