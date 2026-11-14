import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { useDevices } from '../../../store/selectors';
import { flattenPages, useDriveConflicts, useDrivePlacementRows } from '../data';

export type DriveSyncTone = 'positive' | 'info' | 'warning' | 'critical';

export interface DriveSyncSummary {
  readonly tone: DriveSyncTone;
  readonly icon: IconName;
  readonly pill: string;
  readonly line: string;
}

export interface OpenConflicts {
  readonly open: number;
  readonly more: boolean;
}

export interface SyncInputs {
  readonly placements: readonly DrivePlacement[];
  readonly names: ReadonlyMap<string, string>;
  readonly conflicts: OpenConflicts;
}

function computersText(placements: readonly DrivePlacement[], names: SyncInputs['names']): string {
  const ids = [...new Set(placements.map((placement) => placement.deviceId))];
  const [only] = ids;
  if (ids.length === 1 && only !== undefined) return names.get(only) ?? '1 computer';
  return plural(ids.length, 'computer');
}

function conflictsText(conflicts: OpenConflicts): string {
  return conflicts.more
    ? `${count(conflicts.open)}+ conflicts`
    : plural(conflicts.open, 'conflict');
}

export function isFailedPlacement(placement: DrivePlacement): boolean {
  return placement.status.state === 'failed' || placement.status.errors.length > 0;
}

function failedSummary(
  failing: readonly DrivePlacement[],
  names: SyncInputs['names'],
): DriveSyncSummary {
  const problems = failing.reduce(
    (all, placement) => all + Math.max(1, placement.status.errors.length),
    0,
  );
  return {
    tone: 'critical',
    icon: 'warning',
    pill: plural(problems, 'sync problem'),
    line: `Sync failed on ${computersText(failing, names)}`,
  };
}

function conflictSummary(conflicts: OpenConflicts): DriveSyncSummary {
  const text = conflictsText(conflicts);
  const waits = conflicts.open === 1 && !conflicts.more ? 'waits' : 'wait';
  return { tone: 'warning', icon: 'warning', pill: text, line: `${text} ${waits} for you` };
}

function heldSummary(
  held: readonly DrivePlacement[],
  names: SyncInputs['names'],
): DriveSyncSummary {
  return {
    tone: 'warning',
    icon: 'pause',
    pill: `${plural(held.length, 'folder')} on hold`,
    line: `${plural(held.length, 'folder')} on hold on ${computersText(held, names)}`,
  };
}

function movingSummary(
  moving: readonly DrivePlacement[],
  names: SyncInputs['names'],
): DriveSyncSummary {
  const need = bytes(moving.reduce((all, placement) => all + placement.status.needBytes, 0));
  return {
    tone: 'info',
    icon: 'refresh',
    pill: `${need} left`,
    line: `Syncing ${need} to ${computersText(moving, names)}`,
  };
}

function settledSummary(
  active: readonly DrivePlacement[],
  names: SyncInputs['names'],
): DriveSyncSummary {
  const synced = active.filter((placement) => placement.mode === 'synced');
  if (synced.length === 0) {
    return {
      tone: 'positive',
      icon: 'circleCheck',
      pill: 'Mounted',
      line: `Mounted on ${computersText(active, names)}`,
    };
  }
  return {
    tone: 'positive',
    icon: 'circleCheck',
    pill: 'Up to date',
    line: `Synced on ${computersText(synced, names)} · up to date`,
  };
}

export function driveSyncSummaryOf(inputs: SyncInputs): DriveSyncSummary | null {
  const { names, conflicts } = inputs;
  const active = inputs.placements.filter((placement) => placement.enabled);
  if (active.length === 0) return null;
  const failing = active.filter(isFailedPlacement);
  if (failing.length > 0) return failedSummary(failing, names);
  if (conflicts.open > 0) return conflictSummary(conflicts);
  const held = active.filter((placement) => placement.hold !== null);
  if (held.length > 0) return heldSummary(held, names);
  const moving = active.filter(
    (placement) => placement.mode === 'synced' && placement.status.needBytes > 0,
  );
  if (moving.length > 0) return movingSummary(moving, names);
  return settledSummary(active, names);
}

export function useOpenConflicts(): OpenConflicts {
  const conflicts = useDriveConflicts(null);
  const open = flattenPages(conflicts.data, (page) => page.items).filter(
    (conflict) => conflict.resolvedAt === null,
  ).length;
  return { open, more: conflicts.hasNextPage };
}

export function useDriveSyncSummary(): DriveSyncSummary | null {
  const placements = useDrivePlacementRows();
  const names = new Map(useDevices().map((device) => [device.id, device.label]));
  return driveSyncSummaryOf({ placements, names, conflicts: useOpenConflicts() });
}

export function SyncPill(): ReactNode {
  const summary = useDriveSyncSummary();
  if (summary === null) return null;
  return (
    <Interactive
      href={href.drivePage('computers')}
      label={`${summary.line}, open Computers`}
      className="h-control-h flex-row items-center gap-2 rounded-full bg-surface-2 px-4"
      layerClassName="rounded-full"
    >
      <Icon name={summary.icon} size={16} tone={summary.tone} />
      <Text variant="label" tone="variant" numberOfLines={1} className="tabular">
        {summary.pill}
      </Text>
    </Interactive>
  );
}

export function SyncLine({ summary }: { readonly summary: DriveSyncSummary }): ReactNode {
  return (
    <Interactive
      href={href.drivePage('computers')}
      label={`${summary.line}, open Computers`}
      className="min-h-touch-min flex-row items-center gap-2 rounded-sm"
      layerClassName="rounded-sm"
    >
      <Icon name={summary.icon} size={16} tone={summary.tone} />
      <View className="min-w-0 flex-1">
        <Text variant="footnote" tone="variant" numberOfLines={2} className="tabular">
          {summary.line}
        </Text>
      </View>
    </Interactive>
  );
}
