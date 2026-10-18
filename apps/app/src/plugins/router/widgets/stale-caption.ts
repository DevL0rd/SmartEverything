import type { RouterSnapshot } from '@smarteverything/domain';
import { duration, MINUTE_MS } from '../../../format/time';

export interface StaleCaption {
  readonly short: string;
  readonly long: string;
  readonly critical: boolean;
}

function minutesText(since: string, now: number): string {
  const minutes = Math.max(1, Math.floor((now - Date.parse(since)) / MINUTE_MS));
  return duration(minutes * 60);
}

export function staleCaptionOf(
  connection: RouterSnapshot['connection'],
  now: number,
): StaleCaption | null {
  switch (connection.state) {
    case 'unreachable': {
      const elapsed = minutesText(connection.since, now);
      return {
        short: `Offline · ${elapsed}`,
        long: `Can’t reach the router · ${elapsed}`,
        critical: true,
      };
    }
    case 'paused':
      return { short: 'Paused', long: 'Monitoring is paused', critical: false };
    case 'connecting':
      return { short: 'Connecting…', long: 'Connecting…', critical: false };
    case 'online':
    case 'not_set_up':
      return null;
  }
}
