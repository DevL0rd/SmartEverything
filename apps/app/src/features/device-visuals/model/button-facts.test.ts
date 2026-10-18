import type { EventRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { buttonFactsOf, lastPressOf, pressOf, pressesOf } from './button-facts';

const BUTTON = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function event(deviceId: string, kind: EventRow['kind'], action: string, at: string): EventRow {
  return {
    id: '00000000-0000-4000-8000-0000000000ff',
    device_id: deviceId,
    kind,
    occurred_at: at,
    details: { action },
    acknowledged_at: null,
    created_at: at,
  };
}

describe('button presses from events', () => {
  it('turns each action into a gesture', () => {
    expect(
      pressOf(event(BUTTON, 'button', 'single_press', '2026-10-18T10:00:00.000Z'))?.gesture,
    ).toBe('single');
    expect(
      pressOf(event(BUTTON, 'button', 'double_press', '2026-10-18T10:00:00.000Z'))?.gesture,
    ).toBe('double');
    expect(
      pressOf(event(BUTTON, 'button', 'long_press', '2026-10-18T10:00:00.000Z'))?.gesture,
    ).toBe('long');
  });

  it('ignores releases and other kinds of event', () => {
    expect(pressOf(event(BUTTON, 'button', 'release', '2026-10-18T10:00:00.000Z'))).toBeNull();
    expect(pressOf(event(BUTTON, 'motion', 'single_press', '2026-10-18T10:00:00.000Z'))).toBeNull();
  });

  it('finds the newest press of this button only', () => {
    const events = [
      event(BUTTON, 'button', 'single_press', '2026-10-18T10:00:00.000Z'),
      event(BUTTON, 'button', 'long_press', '2026-10-18T11:00:00.000Z'),
      event(BUTTON, 'button', 'release', '2026-10-18T11:00:02.000Z'),
      event(OTHER, 'button', 'double_press', '2026-10-18T12:00:00.000Z'),
    ];
    expect(lastPressOf(events, BUTTON)).toEqual({
      gesture: 'long',
      at: '2026-10-18T11:00:00.000Z',
    });
    expect(buttonFactsOf(events, OTHER).lastPress?.gesture).toBe('double');
    expect(buttonFactsOf([], BUTTON).lastPress).toBeNull();
  });

  it('lists presses since a moment, oldest first', () => {
    const events = [
      event(BUTTON, 'button', 'long_press', '2026-10-18T11:00:00.000Z'),
      event(BUTTON, 'button', 'single_press', '2026-10-18T10:00:00.000Z'),
      event(BUTTON, 'button', 'single_press', '2026-10-17T10:00:00.000Z'),
    ];
    const found = pressesOf(events, BUTTON, Date.parse('2026-10-18T00:00:00.000Z'));
    expect(found.map((press) => press.gesture)).toEqual(['single', 'long']);
  });
});
