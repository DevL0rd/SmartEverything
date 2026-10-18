import { MICROWAVE_KEYS, type DeviceCapability, type JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { ObservedValues } from './lookup';
import { visualStateOf, type VisualDevice } from './visual-state';

const AT = '2026-10-17T10:00:00Z';
const LAMP = 'raw:samsungce.lamp.brightness_level';

function text(key: DeviceCapability['key']): DeviceCapability {
  return { key, label: key, access: 'read', value: { kind: 'text', maxLength: 200 } };
}

function observed(entries: Readonly<Record<string, JsonValue>>): ObservedValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

const OVEN_KEYS: readonly DeviceCapability['key'][] = [
  MICROWAVE_KEYS.mode,
  MICROWAVE_KEYS.power,
  MICROWAVE_KEYS.state,
  MICROWAVE_KEYS.job,
  MICROWAVE_KEYS.duration,
  MICROWAVE_KEYS.progress,
  MICROWAVE_KEYS.door,
  MICROWAVE_KEYS.lock,
  LAMP,
];

const OVEN: VisualDevice = {
  kind: 'appliance',
  model: 'oven',
  online: true,
  capabilities: OVEN_KEYS.map(text),
};

describe('microwave visual state', () => {
  it('counts the remaining time from the programmed time and the progress', () => {
    const state = visualStateOf(
      OVEN,
      observed({
        [MICROWAVE_KEYS.state]: 'running',
        [MICROWAVE_KEYS.job]: 'cooking',
        [MICROWAVE_KEYS.duration]: '00:07:19',
        [MICROWAVE_KEYS.progress]: 38,
        [MICROWAVE_KEYS.mode]: 'Convection',
      }),
    );
    expect(state.power).toBe('on');
    expect(state.microwave).toMatchObject({
      phase: 'running',
      finished: false,
      remaining: 272,
      progress: 0.38,
      mode: 'Convection',
    });
  });

  it('reads the door, the lamp, the child lock and the finished job', () => {
    const state = visualStateOf(
      OVEN,
      observed({
        [MICROWAVE_KEYS.state]: 'ready',
        [MICROWAVE_KEYS.job]: 'finished',
        [MICROWAVE_KEYS.door]: 'open',
        [MICROWAVE_KEYS.lock]: 'locked',
        [LAMP]: 'high',
      }),
    );
    expect(state.power).toBe('off');
    expect(state.microwave).toMatchObject({
      phase: 'idle',
      finished: true,
      remaining: null,
      open: true,
      locked: true,
      lamp: true,
    });
  });

  it('treats a closed door, an unlocked oven and an off lamp as plain', () => {
    const state = visualStateOf(
      OVEN,
      observed({
        [MICROWAVE_KEYS.door]: 'closed',
        [MICROWAVE_KEYS.lock]: 'unlocked',
        [LAMP]: 'off',
      }),
    );
    expect(state.microwave).toMatchObject({ open: false, locked: false, lamp: false });
  });

  it('keeps a paused oven on with its time left', () => {
    const state = visualStateOf(
      OVEN,
      observed({
        [MICROWAVE_KEYS.state]: 'paused',
        [MICROWAVE_KEYS.duration]: '00:02:00',
        [MICROWAVE_KEYS.progress]: 50,
      }),
    );
    expect(state.power).toBe('on');
    expect(state.microwave).toMatchObject({ phase: 'paused', remaining: 60 });
  });

  it('gives the full programmed time before progress is reported', () => {
    const state = visualStateOf(
      OVEN,
      observed({ [MICROWAVE_KEYS.state]: 'running', [MICROWAVE_KEYS.duration]: '00:01:30' }),
    );
    expect(state.microwave).toMatchObject({ remaining: 90, progress: null });
  });
});

describe('microwave visual facts', () => {
  it('takes the time left from the same reading the card and the page use', () => {
    const staged = {
      [MICROWAVE_KEYS.state]: 'running',
      [MICROWAVE_KEYS.duration]: '00:06:00',
      [MICROWAVE_KEYS.progress]: 30,
      [MICROWAVE_KEYS.stageStatus]: { currentStage: { remainingTime: '00:04:12' } },
    };
    expect(visualStateOf(OVEN, observed(staged)).microwave?.remaining).toBe(252);
    expect(
      visualStateOf(OVEN, observed({ ...staged, [MICROWAVE_KEYS.stageStatus]: {} })).microwave
        ?.remaining,
    ).toBe(252);
  });

  it('places the power level on the dial from the levels the microwave reports', () => {
    const levels = ['100W', '300W', '600W', '900W'];
    const at = (power: string): number | null | undefined =>
      visualStateOf(
        OVEN,
        observed({
          [MICROWAVE_KEYS.power]: power,
          [MICROWAVE_KEYS.supportedPower]: levels,
        }),
      ).microwave?.power;
    expect(at('100W')).toBe(0);
    expect(at('600W')).toBeCloseTo(2 / 3, 5);
    expect(at('900W')).toBe(1);
    expect(at('450W')).toBeNull();
    expect(
      visualStateOf(OVEN, observed({ [MICROWAVE_KEYS.power]: '100W' })).microwave?.power,
    ).toBeNull();
  });

  it('marks the finish with the moment the job finished, and only while finished', () => {
    const finished = visualStateOf(OVEN, observed({ [MICROWAVE_KEYS.job]: 'finished' }));
    expect(finished.microwave?.finishedAt).toBe(AT);
    const cooking = visualStateOf(OVEN, observed({ [MICROWAVE_KEYS.job]: 'cooking' }));
    expect(cooking.microwave?.finishedAt).toBeNull();
  });
});

const DIFFUSER: VisualDevice = {
  kind: 'humidifier',
  model: 'xiaomi.diffuser.xw2iv',
  online: true,
  capabilities: [
    { key: 'raw:action.4.1', label: 'Spray now', access: 'write', value: { kind: 'action' } },
    text('raw:5.2'),
    { key: 'raw:2.1', label: 'Fault', access: 'read', value: { kind: 'boolean' } },
  ],
};

describe('diffuser visual state', () => {
  it('marks a spray with the time it was sent', () => {
    const state = visualStateOf(DIFFUSER, {
      'raw:action.4.1': { value: true, observedAt: AT },
    });
    expect(state.diffuser).toEqual({ spray: AT, charging: false, fault: false });
  });

  it('has no spray mark until one is sent', () => {
    expect(visualStateOf(DIFFUSER, {}).diffuser?.spray).toBeNull();
  });

  it('reports charging only while the battery charges', () => {
    expect(visualStateOf(DIFFUSER, observed({ 'raw:5.2': 'Charging' })).diffuser?.charging).toBe(
      true,
    );
    expect(
      visualStateOf(DIFFUSER, observed({ 'raw:5.2': 'Not Charging' })).diffuser?.charging,
    ).toBe(false);
  });

  it('reports a fault only while the diffuser says it has one', () => {
    expect(visualStateOf(DIFFUSER, observed({ 'raw:2.1': true })).diffuser?.fault).toBe(true);
    expect(visualStateOf(DIFFUSER, observed({ 'raw:2.1': false })).diffuser?.fault).toBe(false);
    expect(visualStateOf(DIFFUSER, {}).diffuser?.fault).toBe(false);
  });
});

const PRESENCE: VisualDevice = {
  kind: 'sensor',
  model: 'shelly',
  online: true,
  capabilities: [
    { key: 'occupancy', label: 'Occupancy', access: 'read', value: { kind: 'boolean' } },
    {
      key: 'object_count',
      label: 'Detected objects',
      access: 'read',
      value: { kind: 'number', min: 0, max: 65535, step: 1 },
    },
    {
      key: 'illumination',
      label: 'Light category',
      access: 'read',
      value: { kind: 'enum', options: ['dark', 'twilight', 'bright'] },
    },
  ],
};

describe('presence visual state', () => {
  it('carries the object count and the light category', () => {
    const state = visualStateOf(
      PRESENCE,
      observed({ occupancy: true, object_count: 2, illumination: 'twilight' }),
    );
    expect(state.presence).toBe(true);
    expect(state.detection).toEqual({ objects: 2, light: 'twilight' });
  });

  it('leaves the light out when the category is not one of the three', () => {
    const state = visualStateOf(PRESENCE, observed({ occupancy: false, illumination: 'glare' }));
    expect(state.detection).toEqual({ objects: null, light: null });
  });

  it('draws no radar for a phone or motion sensor that reports occupancy only', () => {
    const phone: VisualDevice = {
      kind: 'sensor',
      model: 'presenceSensor',
      online: true,
      capabilities: [
        { key: 'occupancy', label: 'Occupancy', access: 'read', value: { kind: 'boolean' } },
      ],
    };
    const state = visualStateOf(phone, observed({ occupancy: true }));
    expect(state.presence).toBe(true);
    expect(state.detection).toBeUndefined();
  });

  it('adds nothing to a sensor that reports readings only', () => {
    const state = visualStateOf(
      { kind: 'sensor', model: 'thermometer', online: true, capabilities: [] },
      {},
    );
    expect(state.detection).toBeUndefined();
  });
});
