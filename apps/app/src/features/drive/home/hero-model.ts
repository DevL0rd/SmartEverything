import type { DriveProgressNotice, DriveRoot, DriveStats } from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import type { PhaseProgress, RootProgress } from '../data';
import { KIND_COLOUR, KIND_LABEL, itemsTextOf, type DriveStatsKind } from '../model/item-kinds';
import { QUOTA_WARNING_SHARE } from '../storage/usage-model';

export type QuotaState =
  | { readonly kind: 'limit'; readonly bytes: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown' };

export interface DriveUse {
  readonly used: number;
  readonly quota: QuotaState;
}

export interface HeroGauge {
  readonly text: string;
  readonly share: number | null;
  readonly colour: ColourRole;
}

export interface KindLegendEntry {
  readonly key: DriveStatsKind['kind'];
  readonly label: string;
  readonly value: string;
  readonly colour: ColourRole;
}

export interface DriveHeroModel {
  readonly title: string;
  readonly line: string;
  readonly caption: string | null;
  readonly segments: readonly BarSegment[];
  readonly legend: readonly KindLegendEntry[];
  readonly total: number;
  readonly gauge: HeroGauge | null;
}

export function sizeLineOf(root: Pick<DriveRoot, 'items' | 'bytes'>): string {
  return `${itemsTextOf(root.items)} · ${bytes(root.bytes)}`;
}

export function rootKindsOf(
  stats: Pick<DriveStats, 'roots'> | undefined,
  rootId: string,
): readonly DriveStatsKind[] {
  return stats?.roots.find((row) => row.rootId === rootId)?.kinds ?? [];
}

function legendOf(kinds: readonly DriveStatsKind[]): readonly KindLegendEntry[] {
  return kinds
    .filter((kind) => kind.items > 0)
    .map((kind) => ({
      key: kind.kind,
      label: KIND_LABEL[kind.kind],
      value: bytes(kind.bytes),
      colour: KIND_COLOUR[kind.kind],
    }));
}

function segmentsOf(kinds: readonly DriveStatsKind[]): readonly BarSegment[] {
  return kinds
    .filter((kind) => kind.bytes > 0)
    .map((kind) => ({
      label: KIND_LABEL[kind.kind],
      value: kind.bytes,
      colour: KIND_COLOUR[kind.kind],
    }));
}

export function quotaShareOf(use: DriveUse): number | null {
  if (use.quota.kind !== 'limit') return null;
  if (use.quota.bytes === 0) return 1;
  return Math.min(1, use.used / use.quota.bytes);
}

export function quotaFull(use: DriveUse): boolean {
  return use.quota.kind === 'limit' && use.used >= use.quota.bytes;
}

export type QuotaLevel =
  | { readonly kind: 'room' }
  | { readonly kind: 'near'; readonly share: number }
  | { readonly kind: 'full' };

export const ROOM: QuotaLevel = { kind: 'room' };

export function quotaLevelOf(use: DriveUse): QuotaLevel {
  if (quotaFull(use)) return { kind: 'full' };
  const share = quotaShareOf(use);
  return share !== null && share >= QUOTA_WARNING_SHARE ? { kind: 'near', share } : ROOM;
}

const LEVEL_COLOUR: Readonly<Record<QuotaLevel['kind'], ColourRole>> = {
  room: 'primary',
  near: 'warning',
  full: 'critical',
};

export function quotaGaugeOf(use: DriveUse): HeroGauge | null {
  switch (use.quota.kind) {
    case 'unknown':
      return null;
    case 'none':
      return { text: 'No limit set', share: null, colour: 'primary' };
    case 'limit':
      return {
        text: `${bytes(use.used)} of ${bytes(use.quota.bytes)}`,
        share: quotaShareOf(use),
        colour: LEVEL_COLOUR[quotaLevelOf(use).kind],
      };
  }
}

export function myDriveHeroOf(
  root: DriveRoot,
  kinds: readonly DriveStatsKind[],
  use: DriveUse,
): DriveHeroModel {
  return {
    title: 'My Drive',
    line: sizeLineOf(root),
    caption: null,
    segments: segmentsOf(kinds),
    legend: legendOf(kinds),
    total: root.bytes,
    gauge: quotaGaugeOf(use),
  };
}

export const SHARED_DRIVE_LINE = 'Everyone in the home can open and edit';

export function sharedDriveHeroOf(
  root: DriveRoot,
  kinds: readonly DriveStatsKind[],
  owner: boolean,
): DriveHeroModel {
  return {
    title: 'Shared Drive',
    line: SHARED_DRIVE_LINE,
    caption: owner ? `${sizeLineOf(root)} · Counts toward no one’s quota` : sizeLineOf(root),
    segments: segmentsOf(kinds),
    legend: legendOf(kinds),
    total: root.bytes,
    gauge: null,
  };
}

type Phase = DriveProgressNotice['phase'];

const PHASES: readonly Phase[] = ['scan', 'hash', 'scrub'];

const PHASE_WORD: Readonly<Record<Phase, string>> = {
  scan: 'Scanning',
  hash: 'Finding duplicates',
  scrub: 'Checking for damage',
};

export interface PhaseLine {
  readonly phase: Phase;
  readonly text: string;
  readonly share: number | null;
}

function phaseLine(phase: Phase, progress: PhaseProgress): PhaseLine {
  return {
    phase,
    text: `${PHASE_WORD[phase]} · ${count(progress.done)} of ${count(progress.total)}`,
    share: progress.total === 0 ? 0 : Math.min(1, progress.done / progress.total),
  };
}

export function phaseLinesOf(
  progress: RootProgress | undefined,
  state: DriveRoot['state'] | null,
): readonly PhaseLine[] {
  const lines = PHASES.flatMap((phase) => {
    const shown = progress?.[phase];
    return shown === undefined ? [] : [phaseLine(phase, shown)];
  });
  if (lines.length > 0 || state !== 'scanning') return lines;
  return [{ phase: 'scan', text: 'Scanning', share: null }];
}
