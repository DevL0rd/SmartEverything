import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { clock, duration, MINUTE_MS } from '../../../format/time';
import type { MedallionTone } from '../../shared/medallion-model';
import { protectionOf, type Protection } from '../model/protection';
import { periodText } from '../stats-period';

export interface StaleCaption {
  readonly short: string;
  readonly long: string;
  readonly critical: boolean;
}

function elapsedText(since: string, now: number): string {
  const minutes = Math.max(1, Math.floor((now - Date.parse(since)) / MINUTE_MS));
  return duration(minutes * 60);
}

export function staleCaptionOf(
  connection: AdGuardSnapshot['connection'],
  now: number,
): StaleCaption | null {
  switch (connection.state) {
    case 'unreachable': {
      const elapsed = elapsedText(connection.since, now);
      return {
        short: `Offline · ${elapsed}`,
        long: `Can’t reach AdGuard Home · ${elapsed}`,
        critical: true,
      };
    }
    case 'refused':
      return { short: 'Sign-in refused', long: 'AdGuard Home refused the sign-in', critical: true };
    case 'sign_in_needed':
      return { short: 'Sign-in needed', long: 'AdGuard Home needs its sign-in', critical: false };
    case 'paused':
      return { short: 'Paused', long: 'Monitoring is paused', critical: false };
    case 'connecting':
      return { short: 'Connecting…', long: 'Connecting…', critical: false };
    case 'online':
    case 'not_set_up':
      return null;
  }
}

export interface BlockingView {
  readonly stats: AdGuardStats;
  readonly protection: Protection;
  readonly stale: StaleCaption | null;
  readonly tone: MedallionTone;
  readonly ratio: number;
  readonly percent: string;
  readonly share: string;
  readonly headline: string;
  readonly until: string | null;
  readonly detail: string;
  readonly spoken: string;
}

function headlineOf(protection: Protection, until: string | null): string {
  if (protection === 'paused' && until !== null) {
    return `Paused until ${clock(until)}`;
  }
  return protection === 'off' ? 'Ad blocking is off' : 'Ad blocking is on';
}

function toneOf(protection: Protection, stale: StaleCaption | null): MedallionTone {
  if (stale !== null) {
    return 'neutral';
  }
  return protection === 'on' ? 'positive' : 'warning';
}

export function blockingViewOf(snapshot: AdGuardSnapshot, now: number): BlockingView | null {
  const { stats, status } = snapshot;
  if (stats === null || status === null) {
    return null;
  }
  const protection = protectionOf(status);
  const stale = staleCaptionOf(snapshot.connection, now);
  const percent = decimal(stats.blockedPercent, 1);
  const until = status.pausedUntil;
  const headline = headlineOf(protection, until);
  return {
    stats,
    protection,
    stale,
    tone: toneOf(protection, stale),
    ratio: stats.blockedPercent / 100,
    percent,
    share: `${decimal(stats.blocked)} of ${decimal(stats.queries)} · ${periodText(stats)}`,
    headline,
    until: protection === 'paused' && until !== null ? `until ${clock(until)}` : null,
    detail: protection === 'on' ? '' : 'Ads and trackers are not blocked.',
    spoken: protection === 'on' ? `${headline}, ${percent} percent of lookups blocked` : headline,
  };
}
