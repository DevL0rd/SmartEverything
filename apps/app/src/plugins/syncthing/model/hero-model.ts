import {
  formatBytes,
  formatByteRate,
  type SyncthingSnapshot,
  type SyncState,
} from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { plural } from '../../../format/text';
import { clock } from '../../../format/time';
import type { MedallionTone } from '../../shared/medallion-model';
import type { HeroFigure } from '../../shared/service-hero';
import { SYNC_STATE_TEXT } from '../syncthing-data';
import { overallCompletion } from './completion';

export interface SyncHero {
  readonly stale: boolean;
  readonly tone: MedallionTone;
  readonly title: string;
  readonly figures: readonly [HeroFigure, HeroFigure] | undefined;
  readonly ratio: number | null;
  readonly ringNote: string | undefined;
  readonly facts: readonly string[];
  readonly spoken: string;
  readonly live: boolean;
  readonly canAct: boolean;
}

function stateOf(state: SyncState): { readonly title: string; readonly tone: MedallionTone } {
  const { title, tone } = SYNC_STATE_TEXT[state];
  return { title, tone: tone === 'variant' ? 'neutral' : tone };
}

function rateParts(bytesPerSecond: number): { readonly value: string; readonly unit: string } {
  const text = formatByteRate(bytesPerSecond);
  const space = text.lastIndexOf(' ');
  return { value: text.slice(0, space), unit: text.slice(space + 1) };
}

function devicesLine(summary: SyncthingSnapshot['summary']): string {
  return `${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} connected`;
}

function failedFolders(snapshot: SyncthingSnapshot): number {
  return snapshot.folders.filter((folder) => folder.errorCount > 0).length;
}

function failedLine(failed: number): readonly string[] {
  if (failed === 0) {
    return [];
  }
  return [
    failed === 1 ? '1 folder has failed files' : `${String(failed)} folders have failed files`,
  ];
}

function factsOf(snapshot: SyncthingSnapshot): readonly string[] {
  const { summary, folders } = snapshot;
  switch (summary.state) {
    case 'syncing':
      return [
        ...(summary.needBytes > 0 ? [`${formatBytes(summary.needBytes)} left`] : []),
        devicesLine(summary),
        ...(summary.foldersBehind > 0 ? [`${plural(summary.foldersBehind, 'folder')} behind`] : []),
      ];
    case 'in_sync':
      return [devicesLine(summary), plural(folders.length, 'folder')];
    case 'paused':
      return ['Syncing is paused on this computer'];
    case 'error':
      return [devicesLine(summary), ...failedLine(failedFolders(snapshot))];
    case 'empty':
    case 'offline':
      return ['Folders you share in Syncthing show up here'];
  }
}

function staleTitle(snapshot: SyncthingSnapshot): string {
  const { connection } = snapshot;
  if (connection.state === 'connecting') {
    return 'Connecting…';
  }
  return `Last reading ${clock(connection.state === 'unreachable' ? connection.since : snapshot.at)}`;
}

function staleHero(snapshot: SyncthingSnapshot): SyncHero {
  return {
    stale: true,
    tone: 'neutral',
    title: staleTitle(snapshot),
    figures: undefined,
    ratio: null,
    ringNote: undefined,
    facts: [snapshot.connection.state === 'connecting' ? 'Connecting…' : 'Figures are out of date'],
    spoken: 'Last reading, figures are out of date',
    live: false,
    canAct: false,
  };
}

function ratioOf(snapshot: SyncthingSnapshot): number | null {
  const { state } = snapshot.summary;
  if (state === 'in_sync') {
    return 1;
  }
  return state === 'empty' ? null : overallCompletion(snapshot.folders);
}

function figuresOf(
  summary: SyncthingSnapshot['summary'],
): readonly [HeroFigure, HeroFigure] | undefined {
  if (summary.downloadBytesPerSecond === 0 && summary.uploadBytesPerSecond === 0) {
    return undefined;
  }
  return [
    { label: 'Download', ...rateParts(summary.downloadBytesPerSecond) },
    { label: 'Upload', ...rateParts(summary.uploadBytesPerSecond) },
  ];
}

export function heroOf(snapshot: SyncthingSnapshot): SyncHero {
  if (snapshot.connection.state !== 'online') {
    return staleHero(snapshot);
  }
  const { title, tone } = stateOf(snapshot.summary.state);
  const ratio = ratioOf(snapshot);
  const syncing = snapshot.summary.state === 'syncing';
  const figures = syncing && snapshot.ratesLive ? figuresOf(snapshot.summary) : undefined;
  const percent = ratio === null ? null : Math.floor(ratio * 100);
  return {
    stale: false,
    tone,
    title,
    figures,
    ratio,
    ringNote:
      syncing && percent !== null ? `${decimal(percent)} % of what’s syncing is done` : undefined,
    facts: factsOf(snapshot),
    spoken: percent === null ? title : `${title}, ${decimal(percent)} percent complete`,
    live: figures !== undefined,
    canAct: true,
  };
}

export function tileLine(snapshot: SyncthingSnapshot): string {
  const { connection, summary } = snapshot;
  if (connection.state !== 'online') {
    return connection.state === 'connecting' ? 'Connecting…' : 'Not connected';
  }
  const ratio = ratioOf(snapshot);
  if (summary.state === 'syncing' && ratio !== null) {
    return `Syncing · ${decimal(Math.floor(ratio * 100))} %`;
  }
  return stateOf(summary.state).title;
}
