import type { AdGuardSnapshot, AdGuardTopEntry } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { compact, count, decimal } from '../../../format/number';
import { clock } from '../../../format/time';
import type { CellChip } from '../../shared/cell-parts';
import type { MedallionTone } from '../../shared/medallion-model';
import { staleCaptionOf } from '../widgets/blocking-model';
import { hourlyStack, type HourBar } from './chart-model';
import { protectionOf } from './protection';

type AdGuardCellKind = 'on' | 'paused' | 'off' | 'stale';

interface CellFigure {
  readonly value: string;
  readonly unit: string;
  readonly caption: string;
}

export interface AdGuardCell {
  readonly kind: AdGuardCellKind;
  readonly chip: CellChip;
  readonly tone: MedallionTone;
  readonly ratio: number | null;
  readonly line: string;
  readonly figures: readonly CellFigure[];
  readonly topBlocked: readonly AdGuardTopEntry[];
  readonly topClients: readonly AdGuardTopEntry[];
  readonly lists: string | null;
  readonly bars: readonly HourBar[];
  readonly spoken: string;
  readonly reason: string | null;
}

const TOP_ROWS = 3;
const LIVE_BARS = 40;
const RATE_WINDOW = 30;
const SECONDS_PER_MINUTE = 60;

function staleChip(connection: AdGuardSnapshot['connection']): CellChip {
  switch (connection.state) {
    case 'paused':
      return { tone: 'warning', label: 'Paused' };
    case 'connecting':
      return { tone: 'info', label: 'Connecting…' };
    case 'sign_in_needed':
    case 'refused':
      return { tone: 'critical', label: 'Sign-in needed' };
    case 'online':
    case 'not_set_up':
    case 'unreachable':
      return { tone: 'neutral', label: 'Not reachable' };
  }
}

function listsOf(snapshot: AdGuardSnapshot): string | null {
  const enabled = snapshot.filters.filter((filter) => filter.enabled);
  if (enabled.length === 0) {
    return null;
  }
  const rules = enabled.reduce((sum, filter) => sum + filter.rules, 0);
  return `${count(enabled.length)} lists · ${compact(rules)} rules`;
}

export function blockedPerMinute(blockedRate: readonly ChartPoint[]): number | null {
  const recent = blockedRate.slice(-RATE_WINDOW);
  if (recent.length === 0) {
    return null;
  }
  const mean = recent.reduce((sum, point) => sum + point.v, 0) / recent.length;
  return mean * SECONDS_PER_MINUTE;
}

export function liveBars(
  lookups: readonly ChartPoint[],
  blocked: readonly ChartPoint[],
): readonly HourBar[] {
  const blockedAt = new Map(blocked.map((point) => [point.t, point.v]));
  return lookups.slice(-LIVE_BARS).map((point) => {
    const stopped = Math.min(point.v, blockedAt.get(point.t) ?? 0);
    return {
      key: String(point.t),
      at: point.t,
      label: clock(point.t),
      allowed: point.v - stopped,
      blocked: stopped,
      total: point.v,
    };
  });
}

function spokenOf(chip: CellChip, line: string): string {
  return `AdGuard Home, ${chip.label.toLowerCase()}, ${line}`;
}

function staleCell(snapshot: AdGuardSnapshot, now: number): AdGuardCell {
  const chip = staleChip(snapshot.connection);
  const line = staleCaptionOf(snapshot.connection, now)?.long ?? 'Not reachable';
  return {
    kind: 'stale',
    chip,
    tone: 'neutral',
    ratio: null,
    line,
    figures: [],
    topBlocked: [],
    topClients: [],
    lists: null,
    bars: [],
    spoken: spokenOf(chip, line),
    reason: line,
  };
}

function lineOf(snapshot: AdGuardSnapshot, kind: AdGuardCellKind): string {
  const { stats, status } = snapshot;
  if (kind === 'off') {
    return 'Ad blocking is off';
  }
  if (kind === 'paused') {
    const until = status?.pausedUntil;
    return until === null || until === undefined ? 'Paused' : `Paused · resumes ${clock(until)}`;
  }
  return stats === null
    ? 'Ad blocking is on'
    : `${decimal(stats.blockedPercent)} % blocked · ${count(stats.queries)} lookups`;
}

const CHIPS: Readonly<Record<'on' | 'paused' | 'off', CellChip>> = {
  on: { tone: 'positive', label: 'Protecting' },
  paused: { tone: 'warning', label: 'Paused' },
  off: { tone: 'critical', label: 'Off' },
};

const TONES: Readonly<Record<'on' | 'paused' | 'off', MedallionTone>> = {
  on: 'positive',
  paused: 'warning',
  off: 'critical',
};

export function adguardCellOf(snapshot: AdGuardSnapshot, now: number): AdGuardCell {
  const { status, stats, connection } = snapshot;
  if (connection.state !== 'online' || status === null) {
    return staleCell(snapshot, now);
  }
  const kind = protectionOf(status);
  const chip = CHIPS[kind];
  const line = lineOf(snapshot, kind);
  const figures: readonly CellFigure[] =
    stats === null ? [] : [{ value: decimal(stats.blockedPercent), unit: '%', caption: 'blocked' }];
  return {
    kind,
    chip,
    tone: TONES[kind],
    ratio: stats === null ? null : stats.blockedPercent / 100,
    line,
    figures,
    topBlocked: stats?.topBlocked.slice(0, TOP_ROWS) ?? [],
    topClients: stats?.topClients.slice(0, TOP_ROWS) ?? [],
    lists: listsOf(snapshot),
    bars: stats === null ? [] : hourlyStack(stats, snapshot.at),
    spoken: spokenOf(chip, line),
    reason: null,
  };
}
