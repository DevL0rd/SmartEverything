import { describe, expect, it } from 'vitest';
import { mapDevice } from '../src/device-mapping';
import type { SmartThingsDeviceEvent } from '../src/webhook-messages';
import { DEVICE } from '../src/rest-schemas';
import {
  deviceEventsFor,
  isOnlineHealth,
  reportsAttribute,
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

  it('reports nothing when the alarm clears or for non-text values', () => {
    expect(
      deviceEventsFor(
        eventOf({ capability: 'motionSensor', attribute: 'motion', value: 'inactive' }),
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

  it('summarises appliance events and skips repeats and unknown values', () => {
    const door = { capability: 'samsungce.doorState', attribute: 'doorState' } as const;
    expect(deviceEventsFor(eventOf({ ...door, value: 'open' }), AT)).toEqual([
      {
        externalId: 'light-1',
        kind: 'opened',
        occurredAt: AT,
        details: {
          component: 'main',
          value: 'open',
          summary: 'Door opened',
          topic: 'Door',
          capability: 'raw:samsungce.door_state.door_state',
        },
      },
    ]);
    expect(deviceEventsFor(eventOf({ ...door, value: 'closed' }), AT)[0]?.kind).toBe('activity');
    expect(deviceEventsFor(eventOf({ ...door, value: 'ajar' }), AT)).toEqual([]);
    expect(deviceEventsFor(eventOf({ ...door, value: 3 }), AT)[0]).toBeUndefined();
    expect(deviceEventsFor(eventOf({ ...door, value: null }), AT)).toEqual([]);
    const previous = { 'samsungce.doorState': { doorState: { value: 'open' } } };
    expect(deviceEventsFor(eventOf({ ...door, value: 'open' }), AT, previous)).toEqual([]);
    expect(deviceEventsFor(eventOf({ ...door, value: 'closed' }), AT, previous)).toHaveLength(1);
  });

  it('passes an attribute outside the registry through as an activity event with its name', () => {
    expect(
      deviceEventsFor(
        eventOf({
          capability: 'airConditionerMode',
          attribute: 'airConditionerMode',
          value: 'cool',
        }),
        AT,
        undefined,
        true,
      ),
    ).toEqual([
      {
        externalId: 'light-1',
        kind: 'activity',
        occurredAt: AT,
        details: {
          component: 'main',
          value: 'cool',
          attribute: 'airConditionerMode',
          capability: 'raw:air_conditioner_mode.air_conditioner_mode',
          topic: 'Air conditioner mode',
          summary: 'Air conditioner mode: cool',
        },
      },
    ]);
  });

  it('carries the event data and the component of a passed-through attribute', () => {
    const [event] = deviceEventsFor(
      eventOf({
        componentId: 'night',
        capability: 'lock',
        attribute: 'lock',
        value: 'unlocked',
        data: { method: 'keypad', codeId: '3' },
      }),
      AT,
      undefined,
      true,
    );
    expect(event?.details).toMatchObject({
      component: 'night',
      attribute: 'lock',
      value: 'unlocked',
      arguments: { method: 'keypad', codeId: '3' },
    });
  });

  it('passes a boolean attribute through and skips repeats, readings and structures', () => {
    const mute = { capability: 'audioMute', attribute: 'mute' } as const;
    expect(
      deviceEventsFor(eventOf({ ...mute, value: true }), AT, undefined, true)[0]?.details,
    ).toMatchObject({
      value: true,
      summary: 'Mute: true',
    });
    const previous = { audioMute: { mute: { value: true } } };
    expect(deviceEventsFor(eventOf({ ...mute, value: true }), AT, previous, true)).toEqual([]);
    expect(deviceEventsFor(eventOf({ ...mute, value: false }), AT, previous, true)).toHaveLength(1);
    expect(
      deviceEventsFor(
        eventOf({ capability: 'powerMeter', attribute: 'power', value: 41 }),
        AT,
        undefined,
        true,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(
        eventOf({ capability: 'ocf', attribute: 'supportedModes', value: ['a', 'b'] }),
        AT,
        undefined,
        true,
      ),
    ).toEqual([]);
    expect(
      deviceEventsFor(eventOf({ ...mute, value: true, stateChange: false }), AT, undefined, true),
    ).toEqual([]);
  });

  it('passes nothing through for an attribute a binding already reports as state', () => {
    const state = lightState();
    const switched = eventOf({ capability: 'switch', attribute: 'switch', value: 'off' });
    expect(reportsAttribute(state, switched)).toBe(true);
    expect(reportsAttribute(state, eventOf({ capability: 'lock', attribute: 'lock' }))).toBe(false);
    expect(deviceEventsFor(switched, AT, undefined, !reportsAttribute(state, switched))).toEqual(
      [],
    );
  });

  it('reports a button event whose value is structured', () => {
    expect(
      deviceEventsFor(eventOf({ capability: 'button', attribute: 'button', value: { n: 1 } }), AT),
    ).toHaveLength(1);
  });

  it('reports a new software update as maintenance', () => {
    const update = {
      capability: 'samsungce.softwareUpdate',
      attribute: 'newVersionAvailable',
    } as const;
    expect(deviceEventsFor(eventOf({ ...update, value: true }), AT)[0]?.kind).toBe('maintenance');
    expect(deviceEventsFor(eventOf({ ...update, value: false }), AT)[0]?.kind).toBe('activity');
  });

  it('reads a health status as online or offline', () => {
    expect(isOnlineHealth('ONLINE')).toBe(true);
    expect(isOnlineHealth('UNHEALTHY')).toBe(false);
  });
});
