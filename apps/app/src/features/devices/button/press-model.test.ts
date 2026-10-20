import { describe, expect, it } from 'vitest';
import type { EventRow } from '@smarteverything/domain';
import {
  buttonTrigger,
  rowId,
  setPower,
  storedAutomationRow,
} from '../../../test-support/automation-rows';
import {
  STRIP_PRESS_MS,
  meaningFor,
  meaningLine,
  meaningOf,
  phraseOf,
  stripSegments,
  weekCounts,
} from './press-model';

const KITCHEN = '00000000-0000-4000-8000-000000000129';
const LIVING = '00000000-0000-4000-8000-000000000030';
const NOW = Date.parse('2026-10-18T12:00:00.000Z');

function pressRow(index: number, name: string, press: string | undefined, enabled = true): unknown {
  return storedAutomationRow({
    index,
    name,
    triggers: [buttonTrigger(KITCHEN, press)],
    nodes: [setPower(LIVING, true)],
    enabled,
  });
}

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
  const ROWS = [
    pressRow(1, 'Kitchen switch - press cycles brightness', 'single_press'),
    pressRow(2, 'Kitchen switch - long press off', 'long_press'),
  ];

  it('reads press and hold of the kitchen switch from stored rows', () => {
    const meaning = meaningOf(ROWS, KITCHEN);
    expect(meaning.map((entry) => entry.gestures)).toEqual([['single'], ['long']]);
    expect(meaning.map((entry) => entry.automationId)).toEqual([rowId(1), rowId(2)]);
    expect(meaningLine(meaning)).toBe('Press: cycles brightness · Hold: off');
  });

  it('keeps one button apart from another', () => {
    expect(meaningOf(ROWS, LIVING)).toEqual([]);
  });

  it('leaves out switched-off automations', () => {
    expect(meaningOf([pressRow(1, 'Kitchen - press', 'single_press', false)], KITCHEN)).toEqual([]);
  });

  it('leaves out a stored row that no longer reads as a program', () => {
    expect(meaningOf([{ id: 'old', name: 'Old', enabled: true, definition: {} }], KITCHEN)).toEqual(
      [],
    );
  });

  it('counts every gesture when a trigger names no action', () => {
    expect(
      meaningOf([pressRow(1, 'Kitchen - any press', undefined)], KITCHEN)[0]?.gestures,
    ).toEqual(['single', 'double', 'long']);
  });

  it('says how many more there are after two', () => {
    const many = [
      pressRow(1, 'Kitchen - press lights', 'single_press'),
      pressRow(2, 'Kitchen - double press lights', 'double_press'),
      pressRow(3, 'Kitchen - long press lights', 'long_press'),
    ];
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
