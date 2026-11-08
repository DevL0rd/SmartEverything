import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  DrivePlacement,
  DrivePlacementHold,
  DrivePlacementState,
  DriveRoot,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { FolderPickerSheet } from '../../computers/files/folder-picker-sheet';
import { isStale } from '../placements/placement-row';
import { MODE_WORD, placementWordsOf } from '../placements/placement-status';
import { PlacementSwitchSheet } from '../placements/placement-switch-sheet';
import {
  childPath,
  parentPath,
  placementBodyOf,
  usePlacementChange,
  usePlacements,
  type ComputerPlacement,
  type PlacementChange,
  type PlacementTarget,
} from '../placements/use-placements';

export const COMPUTERS_TITLE = 'Computers';

export const COMPUTERS_FOOTER =
  'Which subfolders a computer keeps is chosen in the Desktop app on that computer.';

export const NOT_SYNCED = 'Not synced';

const STATE_LABEL: Readonly<Record<DrivePlacementState, string>> = {
  starting: 'Starting',
  mounted: MODE_WORD.mounted,
  syncing: 'Syncing',
  up_to_date: 'Up to date',
  offline: 'Offline',
  stopped: 'Stopped',
  failed: 'Failed',
  blocked: 'Blocked',
};

const HOLD_DETAIL: Readonly<Record<DrivePlacementHold, string>> = {
  trashed: 'The folder is in the trash',
  no_access: 'No access to this folder any more',
  sync_off: 'Sync is off for this folder',
};

export interface ComputerSyncState {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly detail: string | null;
  readonly on: boolean;
  readonly held: boolean;
}

function syncedDetailOf(placement: DrivePlacement, needBytes: number): string | null {
  const { status } = placement;
  const detail = joinParts([
    needBytes === 0 ? null : `${bytes(needBytes)} to get`,
    status.pendingUploads === 0 ? null : `${plural(status.pendingUploads, 'change')} to send`,
    status.reason,
  ]);
  return detail === '' ? null : detail;
}

function placedStateOf(placement: DrivePlacement, needBytes: number): ComputerSyncState {
  const words = placementWordsOf(placement, needBytes);
  const tone = words.tone ?? 'neutral';
  if (placement.hold !== null) {
    return { label: 'Stopped', tone, detail: HOLD_DETAIL[placement.hold], on: false, held: true };
  }
  if (!placement.enabled) {
    return { label: 'Paused', tone, detail: null, on: false, held: false };
  }
  return {
    label: STATE_LABEL[placement.status.state],
    tone,
    detail: syncedDetailOf(placement, needBytes),
    on: true,
    held: false,
  };
}

export function computerSyncStateOf(row: ComputerPlacement): ComputerSyncState {
  const { placement } = row;
  if (placement === null) {
    return { label: NOT_SYNCED, tone: 'neutral', detail: null, on: false, held: false };
  }
  if (placement.mode === 'mounted') {
    return { label: MODE_WORD.mounted, tone: 'neutral', detail: null, on: false, held: false };
  }
  return placedStateOf(placement, row.needBytes);
}

export type ComputerSwitch =
  | { readonly kind: 'pick' }
  | { readonly kind: 'toSynced' }
  | { readonly kind: 'enable'; readonly enabled: boolean }
  | { readonly kind: 'none' };

export function computerSwitchOf(row: ComputerPlacement, value: boolean): ComputerSwitch {
  const { placement } = row;
  if (placement === null) return value ? { kind: 'pick' } : { kind: 'none' };
  if (placement.hold !== null) return { kind: 'none' };
  if (placement.mode === 'mounted') return value ? { kind: 'toSynced' } : { kind: 'none' };
  return placement.enabled === value ? { kind: 'none' } : { kind: 'enable', enabled: value };
}

export function syncedBodyOf(
  row: ComputerPlacement,
  target: PlacementTarget,
  localPath: string,
  enabled: boolean,
): ReturnType<typeof placementBodyOf> {
  return { ...placementBodyOf(row.computer.deviceId, target, 'synced', localPath), enabled };
}

interface RowFlow {
  readonly picking: boolean;
  readonly switching: boolean;
  readonly toggle: (value: boolean) => void;
  readonly repath: () => void;
  readonly picked: (parent: string) => void;
  readonly confirmSynced: () => void;
  readonly closePicker: () => void;
  readonly closeSwitch: () => void;
}

function useRowFlow(
  row: ComputerPlacement,
  target: PlacementTarget,
  change: PlacementChange,
): RowFlow {
  const [picking, setPicking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { placement } = row;
  const closeSwitch = (): void => {
    setSwitching(false);
  };
  return {
    picking,
    switching,
    toggle: (value): void => {
      const next = computerSwitchOf(row, value);
      if (next.kind === 'pick') setPicking(true);
      if (next.kind === 'toSynced') setSwitching(true);
      if (next.kind === 'enable' && placement !== null) {
        change.set(syncedBodyOf(row, target, placement.localPath, next.enabled));
      }
    },
    repath: (): void => {
      setPicking(true);
    },
    picked: (parent): void => {
      const enabled = placement?.mode === 'synced' ? placement.enabled : true;
      change.set(syncedBodyOf(row, target, childPath(parent, target.name), enabled));
    },
    confirmSynced: (): void => {
      if (placement === null) return;
      change.set(syncedBodyOf(row, target, placement.localPath, true), closeSwitch);
    },
    closePicker: (): void => {
      setPicking(false);
    },
    closeSwitch,
  };
}

function useStaleCaption(at: string | null): string {
  return useMinuteOf((now) => (at === null ? '' : `Last known ${moment(at, now)}`));
}

function PathLine({
  placement,
  editable,
  onChange,
}: {
  readonly placement: DrivePlacement | null;
  readonly editable: boolean;
  readonly onChange: () => void;
}): ReactNode {
  if (placement?.mode !== 'synced') return null;
  return (
    <View className="flex-row items-center gap-2">
      <Text
        variant="footnote"
        tone="variant"
        numberOfLines={1}
        className="min-w-0 shrink font-mono"
      >
        {placement.localPath}
      </Text>
      {editable ? <Button label="Change" variant="text" onPress={onChange} /> : null}
    </View>
  );
}

function RowDetail({
  row,
  state,
  flow,
  change,
}: {
  readonly row: ComputerPlacement;
  readonly state: ComputerSyncState;
  readonly flow: RowFlow;
  readonly change: PlacementChange;
}): ReactNode {
  if (row.placement?.mode !== 'synced' && change.problem === null) return null;
  return (
    <View className="gap-1 px-4 pb-3">
      <PathLine placement={row.placement} editable={!state.held} onChange={flow.repath} />
      {change.problem === null || flow.switching ? null : (
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text variant="footnote" tone="critical" className="min-w-0 shrink">
            {change.problem}
          </Text>
          {change.retry === null ? null : (
            <Button label="Try again" variant="text" onPress={change.retry} />
          )}
        </View>
      )}
    </View>
  );
}

function RowSheets({
  row,
  target,
  flow,
  change,
}: {
  readonly row: ComputerPlacement;
  readonly target: PlacementTarget;
  readonly flow: RowFlow;
  readonly change: PlacementChange;
}): ReactNode {
  const { placement } = row;
  return (
    <>
      <FolderPickerSheet
        open={flow.picking}
        mode="folder"
        source={{ kind: 'computer', deviceId: row.computer.deviceId }}
        start={placement === null ? null : parentPath(placement.localPath)}
        onClose={flow.closePicker}
        onChoose={flow.picked}
      />
      <PlacementSwitchSheet
        facts={
          flow.switching && placement !== null
            ? {
                placement,
                to: 'synced',
                computer: row.computer.name,
                folderBytes: target.bytes,
                needBytes: row.needBytes,
              }
            : null
        }
        busy={change.busy}
        problem={change.problem}
        onConfirm={flow.confirmSynced}
        onClose={flow.closeSwitch}
      />
    </>
  );
}

function Trailing({
  row,
  state,
  stale,
  busy,
  toggle,
}: {
  readonly row: ComputerPlacement;
  readonly state: ComputerSyncState;
  readonly stale: boolean;
  readonly busy: boolean;
  readonly toggle: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Badge label={state.label} tone={stale ? 'neutral' : state.tone} />
      <Switch
        value={state.on}
        label={`Sync to ${row.computer.name}`}
        disabled={busy || state.held}
        onChange={toggle}
      />
    </View>
  );
}

export function FolderComputerRow({
  row,
  target,
  live,
}: {
  readonly row: ComputerPlacement;
  readonly target: PlacementTarget;
  readonly live: boolean;
}): ReactNode {
  const change = usePlacementChange();
  const flow = useRowFlow(row, target, change);
  const state = computerSyncStateOf(row);
  const stale = isStale(row, live);
  const staleCaption = useStaleCaption(row.placement?.status.reportedAt ?? null);
  const caption = stale ? staleCaption : state.detail;
  return (
    <View>
      <ListRow
        title={row.computer.name}
        {...(caption === null ? {} : { subtitle: caption })}
        subtitleTone={stale ? 'faint' : 'variant'}
        leading={<IconWell icon={row.computer.glyph} colour="viz-blue" size="m" />}
        trailing={
          <Trailing row={row} state={state} stale={stale} busy={change.busy} toggle={flow.toggle} />
        }
      />
      <RowDetail row={row} state={state} flow={flow} change={change} />
      <RowSheets row={row} target={target} flow={flow} change={change} />
    </View>
  );
}

function NoComputers(): ReactNode {
  return (
    <EmptyState
      compact
      icon="monitor"
      title="No computers yet"
      body="Computers with the Desktop app show here, each with a switch to keep this folder on it."
      action={
        <Button
          label="Open Computers"
          variant="tonal"
          icon="laptop"
          href={href.drivePage('computers')}
        />
      }
    />
  );
}

export function placementTargetOf(root: DriveRoot): PlacementTarget {
  return { rootId: root.id, folderItemId: null, name: root.label, bytes: root.bytes };
}

export function FolderComputers({ root }: { readonly root: DriveRoot }): ReactNode {
  const target = placementTargetOf(root);
  const view = usePlacements(target);
  if (view.loading) {
    return (
      <List title={COMPUTERS_TITLE}>
        <Skeleton className="h-16" />
      </List>
    );
  }
  if (view.rows.length === 0) {
    return (
      <List title={COMPUTERS_TITLE}>
        <NoComputers />
      </List>
    );
  }
  return (
    <List title={COMPUTERS_TITLE} footer={COMPUTERS_FOOTER}>
      {view.rows.map((row) => (
        <FolderComputerRow key={row.computer.deviceId} row={row} target={target} live={view.live} />
      ))}
    </List>
  );
}
