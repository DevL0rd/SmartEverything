import type { RobotLine, RobotStatus } from '@smarteverything/domain';
import { relative } from '../../format/time';

export const LINE_WHO: Readonly<Record<RobotLine['who'], string>> = {
  user: 'You',
  aibi: 'AIBI',
  note: 'Did',
};

export function lastContactText(status: RobotStatus, now: number): string {
  return status.contact === null ? 'Never' : relative(status.contact.at, now);
}

export function conversationText(status: RobotStatus): string {
  if (status.conversation) {
    return 'In a conversation';
  }
  return status.waiting > 0 ? 'Has something to say' : 'Not talking';
}

export function lastHeard(status: RobotStatus): RobotLine | null {
  return [...status.lines].reverse().find((line) => line.who === 'user') ?? null;
}
