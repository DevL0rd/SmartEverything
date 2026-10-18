import { MICROWAVE_KEYS, type JsonValue, type MicrowaveMode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { DeviceValues } from '../../../store/state';
import { microwaveStateLine } from './model';
import {
  drawParts,
  finishedAgo,
  leftText,
  microwaveRun,
  minutesLeftParts,
  minutesUntil,
  powerWords,
  readyMoment,
  type MicrowaveRun,
  type RunInput,
} from './run-model';

const AT = '2026-10-18T07:00:00.000Z';
const FINISHED_AT = Date.parse('2026-10-18T07:00:00.000Z');

function observed(entries: Readonly<Record<string, JsonValue>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

const CONVECTION: MicrowaveMode = {
  mode: 'Convection',
  supportedOperations: ['start', 'set'],
  supportedOptions: {
    temperature: { C: { min: 40, max: 200, default: 180, resolution: 5 } },
  },
};

const COOKING = {
  [MICROWAVE_KEYS.state]: 'running',
  [MICROWAVE_KEYS.mode]: 'Convection',
  [MICROWAVE_KEYS.temperature]: 180,
  [MICROWAVE_KEYS.duration]: '00:06:00',
  [MICROWAVE_KEYS.progress]: 30,
  [MICROWAVE_KEYS.completion]: '2026-10-18T07:36:00.000Z',
  [MICROWAVE_KEYS.remote]: 'true',
  [MICROWAVE_KEYS.door]: 'closed',
  [MICROWAVE_KEYS.lock]: 'unlocked',
};

function run(
  entries: Readonly<Record<string, JsonValue>>,
  extra: Partial<RunInput> = {},
): MicrowaveRun {
  return microwaveRun({
    online: true,
    values: observed(entries),
    spec: CONVECTION,
    ago: null,
    minutesLeft: null,
    drawKey: null,
    ...extra,
  });
}

describe('microwave run', () => {
  it('counts down from one source, so the card, the page and the visual show the same time', () => {
    const cooking = run(COOKING);
    expect(leftText(cooking)).toBe('4:12');
    expect(microwaveStateLine(observed(COOKING))).toBe('Cooking · 4:12 left');
    expect(cooking.progress).toBe(0.3);
  });

  it('describes what is cooking with the temperature the mode takes', () => {
    expect(run(COOKING).settings).toBe('Convection · 180 °C');
    expect(run({ ...COOKING, [MICROWAVE_KEYS.mode]: 'NoOperation' }).settings).toBeNull();
    expect(run(COOKING, { spec: undefined }).settings).toBe('Convection');
  });

  it('puts offline first, then an open door, then paused, running, just finished and idle', () => {
    expect(run(COOKING, { online: false }).phase).toBe('offline');
    expect(run({ ...COOKING, [MICROWAVE_KEYS.door]: 'open' }).phase).toBe('door_open');
    expect(run({ ...COOKING, [MICROWAVE_KEYS.state]: 'paused' }).phase).toBe('paused');
    expect(run(COOKING).phase).toBe('running');
    const resting = { [MICROWAVE_KEYS.state]: 'ready', [MICROWAVE_KEYS.job]: 'finished' };
    expect(run(resting, { ago: 3 }).phase).toBe('ready');
    expect(run(resting, { ago: null }).phase).toBe('idle');
    expect(run({ [MICROWAVE_KEYS.state]: 'ready' }).phase).toBe('idle');
  });

  it('shows the completion time only while cooking', () => {
    expect(run(COOKING).readyAt).toMatch(/^\d{1,2}:\d{2}/u);
    expect(run({ ...COOKING, [MICROWAVE_KEYS.state]: 'ready' }).readyAt).toBeNull();
  });

  it('takes the ready time from the completion time the device reports, only while running', () => {
    const withoutCompletion = Object.fromEntries(
      Object.entries(COOKING).filter(([key]) => key !== MICROWAVE_KEYS.completion),
    );
    expect(readyMoment(observed(COOKING))).toBe(Date.parse('2026-10-18T07:36:00.000Z'));
    expect(readyMoment(observed(withoutCompletion))).toBeNull();
    expect(readyMoment(observed({ ...COOKING, [MICROWAVE_KEYS.state]: 'paused' }))).toBeNull();
    expect(readyMoment(observed({ ...COOKING, [MICROWAVE_KEYS.state]: 'ready' }))).toBeNull();
  });

  it('counts whole minutes left, ticking from the ready time while running', () => {
    expect(run(COOKING).leftMinutes).toBe(4);
    expect(run(COOKING, { minutesLeft: 2 }).leftMinutes).toBe(2);
    const paused = { ...COOKING, [MICROWAVE_KEYS.state]: 'paused' };
    expect(run(paused, { minutesLeft: 2 }).leftMinutes).toBe(4);
    expect(run({ [MICROWAVE_KEYS.state]: 'ready' }).leftMinutes).toBeNull();
    expect(minutesUntil(Date.parse(AT) + 150_000, Date.parse(AT))).toBe(2);
    expect(minutesUntil(Date.parse(AT) - 60_000, Date.parse(AT))).toBe(0);
    expect(minutesUntil(null, Date.parse(AT))).toBeNull();
    expect(minutesLeftParts(4)).toEqual({ value: '4', unit: 'min left' });
    expect(minutesLeftParts(0)).toEqual({ value: '<1', unit: 'min left' });
    expect(minutesLeftParts(null)).toBeNull();
  });

  it('names what blocks remote cooking', () => {
    expect(run({ ...COOKING, [MICROWAVE_KEYS.remote]: 'false' }).blocked).toBe(
      'Turn on remote control on the microwave.',
    );
    expect(run(COOKING).blocked).toBeNull();
  });

  it('reads the kids lock and the lamp', () => {
    const state = run({
      ...COOKING,
      [MICROWAVE_KEYS.lock]: 'locked',
      'raw:samsungce.lamp.brightness_level': 'high',
    });
    expect(state.locked).toBe(true);
    expect(state.lamp).toBe(true);
    expect(run(COOKING).lamp).toBe(false);
  });
});

describe('finished window', () => {
  it('counts whole minutes for ten minutes after the finish and then stops', () => {
    expect(finishedAgo(FINISHED_AT, FINISHED_AT + 30_000)).toBe(0);
    expect(finishedAgo(FINISHED_AT, FINISHED_AT + 3 * 60_000)).toBe(3);
    expect(finishedAgo(FINISHED_AT, FINISHED_AT + 10 * 60_000)).toBeNull();
    expect(finishedAgo(null, FINISHED_AT)).toBeNull();
  });

  it('writes watts with a space and leaves percent alone', () => {
    expect(powerWords('700W')).toBe('700 W');
    expect(powerWords('50%')).toBe('50%');
  });
});

describe('power draw', () => {
  it('reads the draw from the key the device reports it on', () => {
    expect(run(COOKING, { drawKey: 'power_draw_w' }).watts).toBeNull();
    expect(
      microwaveRun({
        online: true,
        values: observed({ ...COOKING, power_draw_w: 1180 }),
        spec: CONVECTION,
        ago: null,
        minutesLeft: null,
        drawKey: 'power_draw_w',
      }).watts,
    ).toBe(1180);
  });

  it('writes a kilowatt figure from a thousand watts', () => {
    expect(drawParts(1180)).toEqual({ value: '1.2', unit: 'kW' });
    expect(drawParts(640.4)).toEqual({ value: '640', unit: 'W' });
  });
});
