import type { RobotActivityEntry, RobotLine } from '@smarteverything/domain';
import type { ActivityLog } from './activity';

const LINES_SHOWN = 8;
const LINES_SCANNED = 200;
const LINE_TEXT_MAX = 400;

const LINE_WHO: Readonly<Partial<Record<RobotActivityEntry['kind'], RobotLine['who']>>> = {
  heard: 'user',
  said: 'aibi',
  action: 'note',
};

export function statusLines(activity: ActivityLog): RobotLine[] {
  const lines: RobotLine[] = [];
  for (const entry of activity.recent(LINES_SCANNED)) {
    const who = LINE_WHO[entry.kind];
    if (who !== undefined) {
      lines.push({ at: entry.at, who, text: entry.title.trim().slice(0, LINE_TEXT_MAX) });
    }
  }
  return lines.slice(-LINES_SHOWN);
}
