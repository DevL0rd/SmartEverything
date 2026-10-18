import type { HistoryRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { onSegments, wattsText } from './relay-model';

const WINDOW = {
  from: Date.parse('2026-10-17T12:00:00.000Z'),
  to: Date.parse('2026-10-18T12:00:00.000Z'),
};

function row(value: boolean, at: string): HistoryRow {
  return {
    id: 1,
    device_id: '00000000-0000-4000-8000-000000000001',
    capability: 'power',
    value,
    observed_at: at,
  };
}

describe('on time of a relay', () => {
  it('turns on and off changes into spans', () => {
    const spans = onSegments(
      [row(true, '2026-10-18T06:00:00.000Z'), row(false, '2026-10-18T08:00:00.000Z')],
      WINDOW,
    );
    expect(spans).toEqual([
      {
        start: Date.parse('2026-10-18T06:00:00.000Z'),
        end: Date.parse('2026-10-18T08:00:00.000Z'),
        state: 'on',
      },
    ]);
  });

  it('keeps counting while it is still on', () => {
    expect(onSegments([row(true, '2026-10-18T11:00:00.000Z')], WINDOW).at(0)?.end).toBe(WINDOW.to);
  });

  it('knows it was already on when the window opened', () => {
    const spans = onSegments([row(false, '2026-10-17T14:00:00.000Z')], WINDOW);
    expect(spans.at(0)?.start).toBe(WINDOW.from);
  });

  it('shows nothing without history and rounds watts', () => {
    expect(onSegments([], WINDOW)).toEqual([]);
    expect(wattsText(41.6)).toBe('42');
  });
});
