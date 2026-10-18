import { describe, expect, it } from 'vitest';
import type { AutomationV2, StepV2 } from '@smarteverything/domain';
import { describeCondition, describeTrigger, sentenceOf, summarize } from './describe';
import { describeStep } from './describe-steps';
import { PERSON_ID, catalogFixture } from './catalog-fixture';
import { LAMP, PURIFIER } from './test-devices';

const NAMES = catalogFixture().names;

function step(value: StepV2): StepV2 {
  return value;
}

describe('describing triggers', () => {
  it('words the clock, sun and interval triggers', () => {
    expect(describeTrigger(NAMES, { on: 'time', at: '07:00' })).toBe('every day at 07:00');
    expect(describeTrigger(NAMES, { on: 'time', at: '07:00', days: [1, 2, 3, 4, 5] })).toBe(
      'on weekdays at 07:00',
    );
    expect(describeTrigger(NAMES, { on: 'sun', event: 'sunset', offsetMinutes: -30 })).toBe(
      '30 min before sunset',
    );
    expect(describeTrigger(NAMES, { on: 'every', minutes: 90 })).toBe('every 1 h 30 min');
  });

  it('words a device state, an event and a weather signal', () => {
    expect(
      describeTrigger(NAMES, {
        on: 'signal',
        source: 'device',
        kind: 'state',
        subject: PURIFIER,
        field: 'pm25',
        test: { is: 'gt', to: 35 },
      }),
    ).toMatch(/Bedroom purifier .*35/);
    expect(
      describeTrigger(NAMES, { on: 'signal', source: 'event', kind: 'motion', subject: LAMP }),
    ).toBe('Hallway light reports “Motion”');
    expect(
      describeTrigger(NAMES, {
        on: 'signal',
        source: 'weather',
        kind: 'forecast',
        field: 'temperature',
        test: { is: 'gt', to: 30 },
      }),
    ).toBe('outdoor temperature goes above 30\u00a0°C');
  });

  it('adds the timing of a signal', () => {
    const text = describeTrigger(NAMES, {
      on: 'signal',
      source: 'device',
      kind: 'state',
      subject: PURIFIER,
      field: 'pm25',
      test: { is: 'gt', to: 35 },
      holdSeconds: 300,
    });
    expect(text).toMatch(/, for 5 min$/);
  });
});

describe('describing conditions', () => {
  it('words time windows with days, daylight and groups', () => {
    expect(describeCondition(NAMES, { time: { after: '22:00', before: '06:00' } })).toBe(
      'it is between 22:00 and 06:00',
    );
    expect(describeCondition(NAMES, { time: { days: [1, 2, 3, 4, 5] } })).toBe('it is on weekdays');
    expect(describeCondition(NAMES, { daylight: 'night' })).toBe(
      'it is between sunset and sunrise',
    );
    expect(
      describeCondition(NAMES, {
        any: [{ daylight: 'day' }, { time: { after: '22:00' } }],
      }),
    ).toBe('(it is between sunrise and sunset) or (it is after 22:00)');
  });

  it('words a comparison of a device reading', () => {
    expect(
      describeCondition(NAMES, {
        compare: { device: PURIFIER, control: 'pm25' },
        test: { is: 'lt', to: 10 },
      }),
    ).toMatch(/is below 10/);
  });
});

describe('describing steps', () => {
  it('names the target, the setting and the value of a temporary change', () => {
    const text = describeStep(
      NAMES,
      step({
        do: 'set',
        target: { device: LAMP },
        control: 'brightness',
        to: 20,
        for: 600_000,
      }),
    );
    expect(text).toMatch(/^temporarily set .* on Hallway light to .*20.* for 10 min$/);
  });

  it('words a temporary change by an amount', () => {
    expect(
      describeStep(
        NAMES,
        step({ do: 'set', target: { device: LAMP }, control: 'brightness', by: 10, for: 60_000 }),
      ),
    ).toBe('temporarily change brightness on Hallway light by 10 for 1 min');
  });

  it('words power, flow and routine steps', () => {
    expect(
      describeStep(
        NAMES,
        step({ do: 'set', target: { device: LAMP }, control: 'power', to: true }),
      ),
    ).toBe('turn on Hallway light');
    expect(describeStep(NAMES, step({ do: 'wait', ms: 90_000 }))).toBe('wait 1 min 30 s');
    expect(
      describeStep(
        NAMES,
        step({ do: 'repeat', times: 3, limitMs: 60_000, steps: [{ do: 'wait', ms: 1000 }] }),
      ),
    ).toBe('repeat 3 times, for at most 1 min');
    expect(
      describeStep(
        NAMES,
        step({
          do: 'if',
          branches: [
            { when: { daylight: 'night' }, then: [] },
            { when: { daylight: 'day' }, then: [] },
          ],
          else: [],
        }),
      ),
    ).toBe('if it is between sunset and sunrise, or 1 other case, otherwise something else');
    expect(describeStep(NAMES, step({ do: 'stop' }))).toBe('stop this run');
  });

  it('words a step that reads a Value or an input', () => {
    expect(
      describeStep(
        NAMES,
        step({
          do: 'set',
          target: { device: PURIFIER },
          control: 'fan_speed',
          to: { from: { value: 'gone' }, add: 5, max: 90 },
        }),
      ),
    ).toBe('set Bedroom purifier fan speed to a removed Value plus 5, at most 90');
  });
});

describe('the sentence of an automation', () => {
  it('joins when, only if and then', () => {
    const automation: AutomationV2 = {
      when: [{ on: 'time', at: '22:30' }],
      onlyIf: { all: [{ daylight: 'night' }] },
      steps: [
        { do: 'notify', message: 'Hi' },
        { do: 'ai', person: PERSON_ID, instruction: 'x' },
      ],
    };
    expect(sentenceOf(summarize(NAMES, automation))).toBe(
      'Every day at 22:30, if it is between sunset and sunrise, send “Hi”, then wake someone removed’s AI in a new chat.',
    );
  });

  it('gives no sentence until there is something to say', () => {
    expect(sentenceOf(summarize(NAMES, { when: [], steps: [] }))).toBeNull();
  });
});
