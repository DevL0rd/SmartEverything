import { describe, expect, it } from 'vitest';
import { bleStatusOf } from './ble-status';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const ON = { configured: true, blockedReason: null, freshUntil: '2026-01-01T12:05:00.000Z' };

describe('bleStatusOf', () => {
  it('reports a failed read with its message', () => {
    expect(bleStatusOf(undefined, new Error('offline'), NOW)).toEqual({
      value: 'Unavailable',
      detail: 'offline',
    });
  });

  it('waits for the first read', () => {
    expect(bleStatusOf(undefined, null, NOW).value).toBe('Reading…');
  });

  it('is off until the owner turns observation on', () => {
    expect(bleStatusOf({ ...ON, configured: false }, null, NOW)).toEqual({
      value: 'Off',
      detail: undefined,
    });
  });

  it('shows why the receiver is blocked', () => {
    expect(bleStatusOf({ ...ON, blockedReason: 'No Bluetooth key' }, null, NOW)).toEqual({
      value: 'Blocked',
      detail: 'No Bluetooth key',
    });
  });

  it('falls back to cloud updates once the last broadcast has expired', () => {
    const stale = { ...ON, freshUntil: '2026-01-01T11:59:00.000Z' };
    expect(bleStatusOf(stale, null, NOW).value).toBe('Cloud only');
  });

  it('is receiving while broadcasts are fresh or no expiry is known', () => {
    expect(bleStatusOf(ON, null, NOW).value).toBe('Receiving');
    expect(bleStatusOf({ ...ON, freshUntil: null }, null, NOW).value).toBe('Receiving');
  });
});
