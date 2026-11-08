import type { ReactNode } from 'react';
import type { DriveSyncClient } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { flattenPages, useDriveConflicts, useDriveSyncClients } from '../../nas/data';
import { SummaryWell } from '../../nas/frame';

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

function computersOf(clients: readonly DriveSyncClient[]): string {
  return plural(new Set(clients.map((client) => client.deviceId)).size, 'computer');
}

function conflictsText(conflicts: OpenConflicts): string {
  return conflicts.more
    ? `${count(conflicts.open)}+ conflicts`
    : plural(conflicts.open, 'conflict');
}

function failedSummary(failing: readonly DriveSyncClient[]): DriveSyncSummary {
  const problems = failing.reduce((all, client) => all + client.errors.length, 0);
  return {
    tone: 'critical',
    icon: 'warning',
    pill: plural(problems, 'sync problem'),
    line: `Sync failed on ${computersOf(failing)}`,
  };
}

function conflictSummary(conflicts: OpenConflicts): DriveSyncSummary {
  const text = conflictsText(conflicts);
  const waits = conflicts.open === 1 && !conflicts.more ? 'waits' : 'wait';
  return { tone: 'warning', icon: 'warning', pill: text, line: `${text} ${waits} for you` };
}

function movingSummary(moving: readonly DriveSyncClient[]): DriveSyncSummary {
  const need = bytes(moving.reduce((all, client) => all + client.needBytes, 0));
  return {
    tone: 'info',
    icon: 'refresh',
    pill: `${need} left`,
    line: `Syncing ${need} to ${computersOf(moving)}`,
  };
}

export function driveSyncSummaryOf(
  clients: readonly DriveSyncClient[],
  conflicts: OpenConflicts,
): DriveSyncSummary | null {
  const enabled = clients.filter((client) => client.enabled);
  if (enabled.length === 0) return null;
  const failing = enabled.filter((client) => client.errors.length > 0);
  if (failing.length > 0) return failedSummary(failing);
  if (conflicts.open > 0) return conflictSummary(conflicts);
  const moving = enabled.filter((client) => client.needBytes > 0);
  if (moving.length > 0) return movingSummary(moving);
  return {
    tone: 'positive',
    icon: 'circleCheck',
    pill: 'In sync',
    line: `Up to date on ${computersOf(enabled)}`,
  };
}

export function useDriveSyncSummary(): DriveSyncSummary | null {
  const clients = useDriveSyncClients();
  const conflicts = useDriveConflicts(null);
  const open = flattenPages(conflicts.data, (page) => page.items).filter(
    (conflict) => conflict.resolvedAt === null,
  ).length;
  return driveSyncSummaryOf(clients, { open, more: conflicts.hasNextPage });
}

export function SyncPill(): ReactNode {
  const summary = useDriveSyncSummary();
  if (summary === null) return null;
  return (
    <Interactive
      href={href.drivePage('sync')}
      label={`${summary.line}, open Sync`}
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

export function SyncWell({ summary }: { readonly summary: DriveSyncSummary }): ReactNode {
  return (
    <SummaryWell title="Sync" trailing={<Icon name={summary.icon} size={16} tone={summary.tone} />}>
      <Text variant="footnote" tone={summary.tone} numberOfLines={1} className="tabular">
        {summary.pill}
      </Text>
    </SummaryWell>
  );
}
