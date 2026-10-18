import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/shelly-presence-catalogue', () => ({
  SHELLY_PRESENCE_FIELDS: [],
  SHELLY_PRESENCE_OPERATIONS: [],
}));

const { shellyPresencePermission } = await import('../src/shelly-presence-permission');
const { SHELLY_PRESENCE_ACTION } = await import('../src/shelly-presence-actions');

describe('the permission of an action the catalogue does not list', () => {
  it('is unknown rather than guessed', () => {
    expect(
      shellyPresencePermission(SHELLY_PRESENCE_ACTION.parse({ action: 'refresh' })),
    ).toBeNull();
  });

  it('is unknown for a schedule whose own entry is missing, whatever it would do', () => {
    const schedule = SHELLY_PRESENCE_ACTION.parse({
      action: 'schedule_create',
      schedule: { timespec: '0 0 * * * *', calls: [{ method: 'Script.Start', params: { id: 1 } }] },
    });
    expect(shellyPresencePermission(schedule)).toBeNull();
  });
});
