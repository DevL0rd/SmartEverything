import { describe, expect, it } from 'vitest';

describe('schedules modules', () => {
  it('load without a browser or a device', async () => {
    const schedules = await import('./schedules');
    const sheet = await import('./schedule-sheet');
    const dnd = await import('./settings-dnd');
    const model = await import('./dnd-model');
    expect(typeof schedules.VacuumSchedules).toBe('function');
    expect(typeof sheet.ScheduleSheet).toBe('function');
    expect(typeof dnd.SETTING_GROUP_BODIES['dnd']).toBe('function');
    expect(typeof model.readDndWindow).toBe('function');
  });
});
