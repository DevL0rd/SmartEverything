import type { ReactNode } from 'react';
import type { DriveConflict, DriveRoot } from '@smarteverything/domain';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { useAreaWidth } from '../../../design/size-class';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { itemsTextOf } from '../roots/root-card-model';
import { splitFigure, statColumnsOf } from '../roots/stat-strip';
import { UNKNOWN_COMPUTER, latestSeenOf, type SyncFacts } from './sync-client-row';
import { fileNameOf, type DayTotal, type HourSeries } from './sync-model';

export interface SyncComputerFact {
  readonly name: string;
  readonly online: boolean;
  readonly lastSeenAt: string | null;
}

export interface SyncConflictFact {
  readonly open: number;
  readonly more: boolean;
  readonly file: string | null;
}

export interface SyncStatsInputs {
  readonly synced: readonly DriveRoot[];
  readonly computers: readonly SyncComputerFact[];
  readonly today: DayTotal | null;
  readonly hour: HourSeries | null;
  readonly conflicts: SyncConflictFact;
  readonly now: number;
  readonly stale: boolean;
}

function foldersItem({ synced }: SyncStatsInputs): MetricItem {
  const shared = synced.filter((root) => root.scope === 'home').length;
  return {
    key: 'folders',
    label: 'Synced folders',
    value: count(synced.length),
    caption: joinParts([
      shared === 0 ? null : `${count(shared)} shared`,
      synced.length - shared === 0 ? null : `${count(synced.length - shared)} yours`,
    ]),
  };
}

interface Away {
  readonly name: string;
  readonly seenAt: number;
}

function longestAway(computers: readonly SyncComputerFact[]): Away | null {
  return computers.reduce<Away | null>((oldest, computer) => {
    if (computer.online || computer.lastSeenAt === null) return oldest;
    const seenAt = Date.parse(computer.lastSeenAt);
    return oldest === null || seenAt < oldest.seenAt ? { name: computer.name, seenAt } : oldest;
  }, null);
}

function awayCaption(computers: readonly SyncComputerFact[], now: number): string {
  const away = longestAway(computers);
  if (away !== null) return `${away.name} seen ${relative(new Date(away.seenAt), now)}`;
  return computers.every((computer) => computer.online) ? 'All online' : 'Not seen yet';
}

function computersItem({ computers, now }: SyncStatsInputs): MetricItem {
  const online = computers.filter((computer) => computer.online).length;
  return {
    key: 'computers',
    label: 'Computers',
    value: count(computers.length),
    unit: `· ${count(online)} online`,
    caption: awayCaption(computers, now),
  };
}

function movedItem({ today }: SyncStatsInputs): MetricItem | null {
  if (today === null) return null;
  return {
    key: 'moved',
    label: 'Moved today',
    ...splitFigure(bytes(today.bytes)),
    caption: itemsTextOf(today.files),
  };
}

function hourItem({ hour }: SyncStatsInputs): MetricItem | null {
  if (hour === null) return null;
  return {
    key: 'hour',
    label: 'Last hour',
    ...splitFigure(bytes(hour.bytes)),
    caption: hour.files === 0 ? 'Nothing moved' : itemsTextOf(hour.files),
    series: hour.points,
  };
}

function conflictsItem({ conflicts }: SyncStatsInputs): MetricItem {
  return {
    key: 'conflicts',
    label: 'Conflicts',
    value: `${count(conflicts.open)}${conflicts.more ? '+' : ''}`,
    caption: conflicts.open === 0 ? 'None waiting' : (conflicts.file ?? 'Wait for you'),
    ...(conflicts.open === 0 ? {} : { tone: 'warning' as const }),
  };
}

export function syncStatItemsOf(inputs: SyncStatsInputs): readonly MetricItem[] {
  return [
    foldersItem(inputs),
    computersItem(inputs),
    movedItem(inputs),
    hourItem(inputs),
    conflictsItem(inputs),
  ].flatMap((item) => (item === null ? [] : [{ ...item, stale: inputs.stale }]));
}

export function SyncStats(inputs: SyncStatsInputs): ReactNode {
  const columns = statColumnsOf(useAreaWidth());
  return (
    <MetricStrip
      items={syncStatItemsOf(inputs)}
      columns={{ compact: columns, medium: columns, expanded: columns }}
    />
  );
}

export interface OpenConflicts {
  readonly items: readonly DriveConflict[];
  readonly more: boolean;
}

export function computerFactsOf(facts: SyncFacts): readonly SyncComputerFact[] {
  const ids = [...new Set(facts.clients.map((client) => client.deviceId))];
  return ids.map((deviceId) => {
    const computer = facts.computers.get(deviceId);
    return {
      name: computer?.name ?? UNKNOWN_COMPUTER,
      online: computer?.online ?? false,
      lastSeenAt: latestSeenOf(facts.clients.filter((client) => client.deviceId === deviceId)),
    };
  });
}

export function conflictFactOf(conflicts: OpenConflicts): SyncConflictFact {
  const [first] = conflicts.items;
  return {
    open: conflicts.items.length,
    more: conflicts.more,
    file:
      first !== undefined && conflicts.items.length === 1 && !conflicts.more
        ? fileNameOf(first.relPath)
        : null,
  };
}
