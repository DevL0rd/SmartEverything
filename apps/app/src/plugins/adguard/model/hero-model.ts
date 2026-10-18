import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import { count, decimal, milliseconds, percent } from '../../../format/number';
import { clock } from '../../../format/time';
import type { MedallionTone } from '../../shared/medallion-model';
import type { HeroFigure } from '../../shared/service-hero';
import { periodText } from '../stats-period';
import { protectionOf, type Protection } from './protection';

export interface HeroModel {
  readonly stale: boolean;
  readonly tone: MedallionTone;
  readonly title: string;
  readonly figures: readonly [HeroFigure] | undefined;
  readonly ratio: number | null;
  readonly facts: readonly string[];
  readonly spoken: string;
  readonly line: string;
  readonly protection: Protection | null;
  readonly locked: string | null;
}

function staleReason(connection: AdGuardSnapshot['connection']): string {
  switch (connection.state) {
    case 'unreachable':
      return 'can’t reach AdGuard Home right now';
    case 'paused':
      return 'monitoring is paused';
    case 'connecting':
      return 'still connecting';
    case 'refused':
      return 'the sign-in was refused';
    case 'sign_in_needed':
      return 'it needs its sign-in';
    case 'not_set_up':
      return 'it isn’t set up';
    case 'online':
      return 'no reading yet';
  }
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function staleTitle(snapshot: AdGuardSnapshot): string {
  const { connection, status } = snapshot;
  if (connection.state === 'connecting' && status === null) {
    return 'Connecting…';
  }
  return `Last reading ${clock(connection.state === 'unreachable' ? connection.since : snapshot.at)}`;
}

function blockedFigure(stats: AdGuardStats | null): readonly [HeroFigure] | undefined {
  return stats === null
    ? undefined
    : [{ label: 'Blocked', value: decimal(stats.blockedPercent, 1), unit: '%' }];
}

function ratioOf(stats: AdGuardStats | null): number | null {
  return stats === null ? null : stats.blockedPercent / 100;
}

function staleHero(snapshot: AdGuardSnapshot): HeroModel {
  const { connection, status, stats } = snapshot;
  const reason = staleReason(connection);
  return {
    stale: true,
    tone: 'neutral',
    title: staleTitle(snapshot),
    figures: blockedFigure(stats),
    ratio: null,
    facts:
      status === null
        ? [sentence(reason)]
        : [`Last known: blocking was ${protectionOf(status)}`, reason],
    spoken: 'Last reading, figures are out of date',
    line: staleTitle(snapshot),
    protection: null,
    locked: sentence(reason),
  };
}

function onFacts(stats: AdGuardStats | null): readonly string[] {
  return stats === null
    ? []
    : [
        `${count(stats.blocked)} of ${count(stats.queries)}`,
        periodText(stats),
        `Answers in ${milliseconds(stats.averageMs)}`,
      ];
}

function spokenOf(title: string, stats: AdGuardStats | null): string {
  return stats === null
    ? title
    : `${title}, ${decimal(stats.blockedPercent, 1)} percent of lookups blocked`;
}

export function heroOf(snapshot: AdGuardSnapshot): HeroModel {
  const { status, stats, connection } = snapshot;
  if (connection.state !== 'online' || status === null) {
    return staleHero(snapshot);
  }
  const protection = protectionOf(status);
  const live = { stale: false, ratio: ratioOf(stats), protection, locked: null } as const;
  if (protection === 'on') {
    const title = 'Ad blocking is on';
    return {
      ...live,
      tone: 'positive',
      title,
      figures: blockedFigure(stats),
      facts: onFacts(stats),
      spoken: spokenOf(title, stats),
      line: stats === null ? title : `${percent(stats.blockedPercent / 100)} blocked`,
    };
  }
  const title = protection === 'paused' ? 'Ad blocking is paused' : 'Ad blocking is off';
  const resumeAt = status.pausedUntil === null ? null : clock(status.pausedUntil);
  return {
    ...live,
    tone: 'warning',
    title,
    figures: undefined,
    facts: [
      resumeAt === null ? 'Until you turn it back on' : `Until ${resumeAt}`,
      'answers are not filtered',
    ],
    spoken: spokenOf(title, stats),
    line: resumeAt === null ? title : `Paused until ${resumeAt}`,
  };
}
