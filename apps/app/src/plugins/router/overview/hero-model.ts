import { formatMegabits, type RouterSnapshot, type SpeedTestResult } from '@smarteverything/domain';
import { decimal, milliseconds } from '../../../format/number';
import { clock } from '../../../format/time';
import { plural } from '../../../format/text';
import type { HeroFigure } from '../../shared/service-hero';
import type { MedallionTone } from '../../shared/medallion-model';
import { lineShare } from './speed-model';

export interface HeroModel {
  readonly stale: boolean;
  readonly tone: MedallionTone;
  readonly title: string;
  readonly figures: readonly [HeroFigure, HeroFigure];
  readonly ratio: number | null;
  readonly ringNote: string | undefined;
  readonly facts: readonly string[];
  readonly spoken: string;
  readonly canRun: boolean;
}

export function rateParts(megabits: number): { readonly value: string; readonly unit: string } {
  const text = formatMegabits(megabits);
  const space = text.lastIndexOf(' ');
  return { value: text.slice(0, space), unit: text.slice(space + 1) };
}

const NO_FIGURES: readonly [HeroFigure, HeroFigure] = [
  { label: 'Download', value: '—' },
  { label: 'Upload', value: '—' },
];

function figuresOf(network: RouterSnapshot['network']): readonly [HeroFigure, HeroFigure] {
  if (network === null) {
    return NO_FIGURES;
  }
  return [
    { label: 'Download', ...rateParts(network.downloadMbps) },
    { label: 'Upload', ...rateParts(network.uploadMbps) },
  ];
}

function staleFacts(connection: RouterSnapshot['connection']): readonly string[] {
  if (connection.state === 'paused') {
    return ['Monitoring is paused', 'figures are out of date'];
  }
  return connection.state === 'connecting' ? ['Connecting…'] : ['Figures are out of date'];
}

function staleTitle(snapshot: RouterSnapshot): string {
  const { connection, network } = snapshot;
  if (connection.state === 'connecting' && network === null) {
    return 'Connecting…';
  }
  return `Last reading ${clock(connection.state === 'unreachable' ? connection.since : snapshot.at)}`;
}

function onlineFacts(snapshot: RouterSnapshot): readonly string[] {
  const online = snapshot.clients.filter((client) => client.connected).length;
  const latency = snapshot.network?.latencyMs;
  return [
    ...(latency === null || latency === undefined ? [] : [milliseconds(latency)]),
    `${plural(online, 'device')} online`,
  ];
}

function staleHero(snapshot: RouterSnapshot): HeroModel {
  return {
    stale: true,
    tone: 'neutral',
    title: staleTitle(snapshot),
    figures: figuresOf(snapshot.network),
    ratio: null,
    ringNote: undefined,
    facts: staleFacts(snapshot.connection),
    spoken: 'Last reading, figures are out of date',
    canRun: false,
  };
}

function downHero(): HeroModel {
  return {
    stale: false,
    tone: 'critical',
    title: 'Internet is down',
    figures: NO_FIGURES,
    ratio: null,
    ringNote: undefined,
    facts: ['The router itself is fine'],
    spoken: 'Internet is down',
    canRun: false,
  };
}

export function canRunSpeedTest(snapshot: RouterSnapshot): boolean {
  return snapshot.connection.state === 'online' && snapshot.network?.wanUp !== false;
}

export function heroOf(snapshot: RouterSnapshot, last: SpeedTestResult | null): HeroModel {
  const { network } = snapshot;
  if (snapshot.connection.state !== 'online') {
    return staleHero(snapshot);
  }
  if (network?.wanUp === false) {
    return downHero();
  }
  const ratio = network === null ? null : lineShare(network.downloadMbps, last);
  const percentOfLine = ratio === null ? null : decimal(ratio * 100);
  return {
    stale: false,
    tone: 'positive',
    title: 'Internet is up',
    figures: figuresOf(network),
    ratio,
    ringNote:
      percentOfLine === null || last === null
        ? undefined
        : `${percentOfLine} % of your ${formatMegabits(last.downloadMbps)} line`,
    facts: onlineFacts(snapshot),
    spoken:
      percentOfLine === null
        ? 'Internet is up'
        : `Internet is up, using ${percentOfLine} percent of measured speed`,
    canRun: true,
  };
}
