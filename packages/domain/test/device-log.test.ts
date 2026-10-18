import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_V2,
  DEVICE_LOG_ENTRY,
  buttonActionTitle,
  isRefill,
  respondsToSignal,
  runsOnClock,
  type SignalInput,
} from '../src';

const KITCHEN_BUTTON = '314d84fd-2a58-4e70-bb0b-95105fb8a9bc';
const OTHER_BUTTON = '0f65a417-be9c-4c34-a387-6417cc96f435';

function press(subject: string, action: string): SignalInput {
  return {
    source: 'event',
    kind: 'button',
    subject,
    field: null,
    value: true,
    previous: null,
    at: '2026-10-17T10:30:00.000Z',
    profileId: null,
    data: { action, source: 'lan-push' },
  };
}

function automation(when: unknown): ReturnType<typeof AUTOMATION_V2.parse> {
  return AUTOMATION_V2.parse({ when, steps: [{ do: 'wait', ms: 1000 }] });
}

describe('which automations react to a button press', () => {
  const cycles = automation([
    {
      on: 'signal',
      source: 'event',
      kind: 'button',
      subject: KITCHEN_BUTTON,
      match: { action: 'single_press' },
    },
  ]);

  it('reacts to the named gesture of that button only', () => {
    expect(respondsToSignal(cycles, press(KITCHEN_BUTTON, 'single_press'))).toBe(true);
    expect(respondsToSignal(cycles, press(KITCHEN_BUTTON, 'long_press'))).toBe(false);
    expect(respondsToSignal(cycles, press(OTHER_BUTTON, 'single_press'))).toBe(false);
  });

  it('reacts to every gesture when the trigger names none', () => {
    const any = automation([
      { on: 'signal', source: 'event', kind: 'button', subject: KITCHEN_BUTTON },
    ]);
    expect(respondsToSignal(any, press(KITCHEN_BUTTON, 'long_press'))).toBe(true);
  });

  it('ignores automations without a signal trigger', () => {
    expect(
      respondsToSignal(
        automation([{ on: 'time', at: '23:00' }]),
        press(KITCHEN_BUTTON, 'single_press'),
      ),
    ).toBe(false);
  });
});

describe('which automations are schedules', () => {
  it('counts an automation with only clock triggers as a schedule', () => {
    expect(
      runsOnClock(
        automation([
          { on: 'time', at: '15:00' },
          { on: 'every', minutes: 30 },
        ]),
      ),
    ).toBe(true);
    expect(runsOnClock(automation([{ on: 'sun', event: 'sunset' }]))).toBe(true);
  });

  it('does not count a manual automation or one with a device trigger', () => {
    expect(runsOnClock(automation([]))).toBe(false);
    expect(
      runsOnClock(
        automation([
          { on: 'time', at: '15:00' },
          { on: 'signal', source: 'event', kind: 'motion' },
        ]),
      ),
    ).toBe(false);
  });
});

describe('device log words and entries', () => {
  it('words each gesture and still says something for an unknown one', () => {
    expect(
      ['single_press', 'double_press', 'long_press', 'release'].map(buttonActionTitle),
    ).toEqual(['Pressed', 'Double-pressed', 'Held', 'Released']);
    expect(buttonActionTitle('triple_click')).toBe('Triple click');
  });

  it('recognises the refill event of a diffuser', () => {
    expect(isRefill({ item: 'fragrance', state: 'refilled' })).toBe(true);
    expect(isRefill({ item: 'dispenser', state: 'cleaned' })).toBe(false);
  });

  it('accepts a press with its effects and refuses an entry without a cause', () => {
    const automationId = '9d063055-ba0a-44a4-b4a0-3a0b2ac78c8d';
    const entry = {
      at: '2026-10-17T10:30:00.000Z',
      kind: 'press',
      title: 'Pressed',
      cause: { kind: 'button', name: 'Kitchen switch' },
      effects: [{ title: 'Kitchen brighter', automationId, outcome: 'ok' }],
    };
    expect(DEVICE_LOG_ENTRY.safeParse(entry).success).toBe(true);
    expect(DEVICE_LOG_ENTRY.safeParse({ ...entry, cause: undefined }).success).toBe(false);
  });
});
