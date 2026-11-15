import { joinParts, plural } from '../../../format/text';
import { moment } from '../../../format/time';
import type { Device } from '../../../store/state';

const NOW_WORD = 'Now';

export function seenTextOf(online: boolean, seenAt: string | null, now: number): string | null {
  if (online) return NOW_WORD;
  return seenAt === null ? null : moment(seenAt, now);
}

function offlinePartOf(offline: readonly Device[]): string {
  const [only, second] = offline;
  if (only === undefined) return 'all online';
  return second === undefined ? `${only.label} offline` : `${String(offline.length)} offline`;
}

export function computersSubtitleOf(computers: readonly Device[]): string | undefined {
  if (computers.length === 0) return undefined;
  return joinParts([
    plural(computers.length, 'computer'),
    offlinePartOf(computers.filter((device) => !device.online)),
  ]);
}
