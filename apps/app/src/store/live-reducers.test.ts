import type { RowChange } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyChange } from './live-reducers';
import { emptyState } from './state';

function stateChange(value: number, observedAt: string): RowChange {
  const row = { device_id: 'd1', capability: 'level', value, observed_at: observedAt };
  return {
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    record: row,
    oldRecord: null,
  };
}

describe('applyChange identity', () => {
  it('keeps the whole state when a device value repeats exactly', () => {
    const first = applyChange(emptyState(), stateChange(5, '2026-10-11T00:00:00.000Z'));
    const again = applyChange(first, stateChange(5, '2026-10-11T00:00:00.000Z'));
    expect(again).toBe(first);
  });

  it('changes only the touched device when a value moves', () => {
    const first = applyChange(emptyState(), stateChange(5, '2026-10-11T00:00:00.000Z'));
    const other = applyChange(first, {
      type: 'change',
      table: 'device_state',
      operation: 'UPDATE',
      record: { device_id: 'd2', capability: 'level', value: 1, observed_at: 'x' },
      oldRecord: null,
    });
    const moved = applyChange(other, stateChange(6, '2026-10-11T00:00:01.000Z'));
    expect(moved.deviceValues['d2']).toBe(other.deviceValues['d2']);
    expect(moved.deviceValues['d1']).not.toBe(other.deviceValues['d1']);
  });
});
