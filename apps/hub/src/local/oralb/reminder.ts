import { oralbHeadStateName } from '@smarteverything/ble';
import { HEAD_REMINDERS } from '@smarteverything/domain';

export function reminderOf(code: number): (typeof HEAD_REMINDERS)[number] | null {
  const name = oralbHeadStateName(code);
  return HEAD_REMINDERS.find((candidate) => candidate === name) ?? null;
}
