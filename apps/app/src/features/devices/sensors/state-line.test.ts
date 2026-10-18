import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { levelPill, roomOnCard, summaryOf } from './state-line';

function labelOf(node: ReturnType<typeof levelPill>): string | undefined {
  return isValidElement<{ readonly label?: string }>(node) ? node.props.label : undefined;
}

describe('sensor card state helpers', () => {
  it('names the level and its number, and says low in words at or below 20 percent', () => {
    expect(labelOf(levelPill('Filter', 70))).toBe('Filter 70 %');
    expect(labelOf(levelPill('Filter', 20))).toBe('Filter low');
    expect(labelOf(levelPill('Water', 5))).toBe('Water low');
  });

  it('leaves the kit wording when no noun is given and draws nothing without a reading', () => {
    expect(labelOf(levelPill(null, 80))).toBeUndefined();
    expect(levelPill('Filter', null)).toBeNull();
  });

  it('drops the room on the narrow card only', () => {
    expect(roomOnCard('m', 'Bedroom')).toBeNull();
    expect(roomOnCard('w', 'Bedroom')).toBe('Bedroom');
    expect(roomOnCard('xl', null)).toBeNull();
  });

  it('builds one accessible summary with the room, offline and the figures', () => {
    expect(
      summaryOf({
        name: 'Purifier',
        room: 'Bedroom',
        offline: true,
        facts: ['Good air', 'PM2.5 8'],
      }),
    ).toBe('Purifier, Bedroom. Offline. Good air. PM2.5 8');
    expect(summaryOf({ name: 'Purifier', room: null, offline: false, facts: [] })).toBe('Purifier');
  });
});
