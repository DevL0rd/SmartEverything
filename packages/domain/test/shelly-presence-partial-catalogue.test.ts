import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/shelly-presence-catalogue', () => ({
  SHELLY_PRESENCE_FIELDS: [],
  SHELLY_PRESENCE_OPERATIONS: [
    { action: 'schedule_create', permission: 'write' },
    { action: 'script_start', permission: 'privileged' },
  ],
}));

const { shellyPresencePermission } = await import('../src/shelly-presence-permission');
const { SHELLY_PRESENCE_ACTION } = await import('../src/shelly-presence-actions');

function schedule(method: string, params: Readonly<Record<string, unknown>>): unknown {
  return {
    action: 'schedule_create',
    schedule: { timespec: '0 0 * * * *', calls: [{ method, params }] },
  };
}

describe('the permission of a schedule when the catalogue lists only part of what it calls', () => {
  it('is the strongest of the schedule and the actions it calls when all are listed', () => {
    expect(
      shellyPresencePermission(SHELLY_PRESENCE_ACTION.parse(schedule('Script.Start', { id: 1 }))),
    ).toBe('privileged');
  });

  it('is unknown when a called action is not listed, even though the schedule itself is', () => {
    expect(
      shellyPresencePermission(SHELLY_PRESENCE_ACTION.parse(schedule('Script.Stop', { id: 1 }))),
    ).toBeNull();
  });
});
