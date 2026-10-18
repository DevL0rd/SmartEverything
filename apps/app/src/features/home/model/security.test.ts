import { describe, expect, it } from 'vitest';
import { alertsFirst, type SecurityLine } from './security';

function line(deviceId: string, alert: boolean): SecurityLine {
  return { deviceId, name: deviceId, state: alert ? 'Open' : 'Closed', alert };
}

describe('alertsFirst', () => {
  it('puts alerting lines first and keeps each group in its order', () => {
    const shown = alertsFirst([
      line('door', false),
      line('garage', true),
      line('lock', false),
      line('leak', true),
    ]);
    expect(shown.map((entry) => entry.deviceId)).toEqual(['garage', 'leak', 'door', 'lock']);
  });
});
