import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AUTOMATION_ROW, type AutomationRow, type EventRow } from '@smarteverything/domain';
import {
  STRIP_PRESS_MS,
  meaningFor,
  meaningLine,
  meaningOf,
  phraseOf,
  stripSegments,
  weekCounts,
} from './press-model';

const STORED = z.array(
  z.object({ name: AUTOMATION_ROW.shape.name, definition: AUTOMATION_ROW.shape.definition }),
);
const LIVE = STORED.parse(
  JSON.parse(
    readFileSync(
      new URL('../../automations/model/live-automations.fixture.json', import.meta.url),
      'utf8',
    ),
  ),
);

const KITCHEN = '00000000-0000-4000-8000-000000000129';
const LIVING = '00000000-0000-4000-8000-000000000030';
const STAMP = '2026-10-16T08:00:00.000Z';
const NOW = Date.parse('2026-10-18T12:00:00.000Z');

function rowOf(
  index: number,
  stored: { readonly name: string; readonly definition: AutomationRow['definition'] },
  enabled = true,
): AutomationRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: stored.name,
    enabled,
    revision: 1,
    definition: stored.definition,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

const ROWS = LIVE.map((stored, index) => rowOf(index + 1, stored));

function eventOf(deviceId: string, action: string, at: string): EventRow {
  return {
    id: `00000000-0000-4000-8000-${String(Date.parse(at) % 1_000_000_000_000).padStart(12, '0')}`,
    device_id: deviceId,
    kind: 'button',
    occurred_at: at,
    details: { action },
    acknowledged_at: null,
    created_at: at,
  };
}

describe('what a button does', () => {
  it('reads press and hold from the live automations of the kitchen switch', () => {
    const meaning = meaningOf(ROWS, KITCHEN);
    expect(meaning.map((entry) => entry.gestures)).toEqual([['single'], ['long']]);
    expect(meaningLine(meaning)).toBe('Press: cycles brightness · Hold: off');
  });

  it('keeps one button apart from another', () => {
    expect(meaningOf(ROWS, LIVING).map((entry) => entry.name)).toEqual([
      'Living room switch - press cycles brightness',
      'Living room switch - long press off',
    ]);
    expect(meaningOf(ROWS, '00000000-0000-4000-8000-999999999999')).toEqual([]);
  });

  it('leaves out automations that only react to a press by keeping notes', () => {
    const reactive = rowOf(500, {
      name: 'Presence - hands off after manual change',
      definition: {
        when: [
          {
            on: 'signal',
            source: 'event',
            kind: 'button',
            subject: KITCHEN,
            match: { action: 'single_press' },
          },
        ],
        steps: [
          { do: 'value', value: '00000000-0000-4000-8000-000000000131', op: 'set', amount: 1 },
        ],
        mode: 'single',
      },
    });
    expect(meaningOf([reactive], KITCHEN)).toEqual([]);
  });

  it('leaves out switched-off automations', () => {
    const first = LIVE[0];
    if (first === undefined) throw new Error('Expected a live automation');
    expect(meaningOf([rowOf(1, first, false)], LIVING)).toEqual([]);
  });

  it('counts every gesture when a trigger names no action', () => {
    const any = rowOf(501, {
      name: 'Kitchen - any press',
      definition: {
        when: [{ on: 'signal', source: 'event', kind: 'button', subject: KITCHEN }],
        steps: [{ do: 'notify', message: 'Pressed' }],
        mode: 'single',
      },
    });
    expect(meaningOf([any], KITCHEN)[0]?.gestures).toEqual(['single', 'double', 'long']);
  });

  it('says how many more there are after two', () => {
    const many = ['single_press', 'double_press', 'long_press'].map((action, index) =>
      rowOf(600 + index, {
        name: `Kitchen - ${action === 'single_press' ? 'press' : action === 'double_press' ? 'double press' : 'long press'} lights`,
        definition: {
          when: [
            { on: 'signal', source: 'event', kind: 'button', subject: KITCHEN, match: { action } },
          ],
          steps: [{ do: 'notify', message: 'x' }],
          mode: 'single',
        },
      }),
    );
    expect(meaningLine(meaningOf(many, KITCHEN))).toBe(
      'Press: lights · Double-press: lights · +1 more',
    );
    expect(meaningFor(meaningOf(many, KITCHEN), 'long')).toHaveLength(1);
  });

  it('shows nothing when the button does nothing', () => {
    expect(meaningLine([])).toBeNull();
  });

  it('takes the part after the dash and drops the gesture word', () => {
    expect(phraseOf('Hall - double press scene')).toBe('scene');
    expect(phraseOf('Porch light on')).toBe('Porch light on');
    expect(phraseOf('Hall - press')).toBe('press');
  });
});

describe('press history', () => {
  const events = [
    eventOf(KITCHEN, 'single_press', '2026-10-18T11:00:00.000Z'),
    eventOf(KITCHEN, 'release', '2026-10-18T11:00:01.000Z'),
    eventOf(KITCHEN, 'long_press', '2026-10-18T10:00:00.000Z'),
    eventOf(KITCHEN, 'double_press', '2026-10-10T10:00:00.000Z'),
    eventOf(LIVING, 'single_press', '2026-10-18T09:00:00.000Z'),
  ];

  it('counts this week without releases or other buttons', () => {
    expect(weekCounts(events, KITCHEN, NOW)).toEqual({ single: 1, double: 0, long: 1 });
  });

  it('draws each press as a short mark on the strip', () => {
    const [press] = stripSegments([{ gesture: 'double', at: '2026-10-18T11:00:00.000Z' }]);
    expect(press?.state).toBe('double');
    expect((press?.end ?? 0) - (press?.start ?? 0)).toBe(STRIP_PRESS_MS);
  });
});
