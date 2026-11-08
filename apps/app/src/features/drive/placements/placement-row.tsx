import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DrivePlacement, DrivePlacementMode } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { StatusDot } from '../../../components/status-dot';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import type { Tone } from '../../../components/tone';
import { moment } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { DemandRegion } from '../../../store/demand-region';
import { FolderPickerSheet } from '../../computers/files/folder-picker-sheet';
import {
  MODE_WORD,
  PlacementNotes,
  placementWordsOf,
  type PlacementWords,
} from './placement-status';
import { PlacementSwitchSheet, type SwitchFacts } from './placement-switch-sheet';
import {
  childPath,
  choiceOf,
  localCopyPath,
  parentPath,
  placementBodyOf,
  usePlacementChange,
  type ComputerPlacement,
  type PlacementChange,
  type PlacementChoice,
  type PlacementTarget,
} from './use-placements';

const MOUNT_TOPICS = ['drive_mounts'] as const;

const OFF_LINE = 'Not on this computer';

export function choiceOptionsOf(library: boolean): readonly SegmentedOption<PlacementChoice>[] {
  return [
    { value: 'off', label: 'Off' },
    ...(library ? [{ value: 'synced', label: MODE_WORD.synced } as const] : []),
    { value: 'mounted', label: MODE_WORD.mounted },
  ];
}

export function lineToneOf(words: PlacementWords | null): Tone {
  if (words?.tone === 'critical') return 'critical';
  if (words?.tone === 'warning') return 'warning';
  return 'variant';
}

export function isStale(row: ComputerPlacement, live: boolean): boolean {
  return row.placement !== null && (!live || !row.computer.online);
}

function useStaleCaption(at: string | null): string {
  return useMinuteOf((now) => (at === null ? '' : `Last known ${moment(at, now)}`));
}

function Lead({
  row,
  words,
  stale,
}: {
  readonly row: ComputerPlacement;
  readonly words: PlacementWords | null;
  readonly stale: boolean;
}): ReactNode {
  const tone = stale ? null : (words?.tone ?? null);
  return (
    <View className="relative">
      <IconWell icon={row.computer.glyph} colour="viz-blue" size="m" />
      {tone === null || words === null ? null : (
        <StatusDot tone={tone} label={words.line} ring="surface-1" />
      )}
    </View>
  );
}

function captionOf(row: ComputerPlacement, stale: boolean, staleText: string): string | undefined {
  if (stale) return staleText;
  return row.computer.online ? undefined : 'Offline';
}

function PathLine({
  placement,
  held,
  onChange,
}: {
  readonly placement: DrivePlacement;
  readonly held: boolean;
  readonly onChange: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink tabular">
        {placement.localPath}
      </Text>
      {held ? null : <Button label="Change" variant="text" onPress={onChange} />}
    </View>
  );
}

function ProblemLine({ change }: { readonly change: PlacementChange }): ReactNode {
  if (change.problem === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      <Text variant="footnote" tone="critical" className="min-w-0 shrink">
        {change.problem}
      </Text>
      {change.retry === null ? null : (
        <Button label="Try again" variant="text" onPress={change.retry} />
      )}
    </View>
  );
}

function useLocalCopyNotice(deviceId: string): (path: string) => void {
  const router = useRouter();
  return (path) => {
    notify({
      message: `The local copy is now ${localCopyPath(path)}`,
      action: {
        label: 'Show in Files',
        onPress: () => {
          router.push(href.settings.device(deviceId, 'files', { path: parentPath(path) }));
        },
      },
    });
  };
}

interface Flow {
  readonly picking: DrivePlacementMode | null;
  readonly switching: PlacementChoice | null;
  readonly choose: (choice: PlacementChoice) => void;
  readonly repath: () => void;
  readonly picked: (parent: string) => void;
  readonly confirm: () => void;
  readonly closePicker: () => void;
  readonly closeSwitch: () => void;
}

function usePlacementFlow(
  row: ComputerPlacement,
  target: PlacementTarget,
  change: PlacementChange,
): Flow {
  const [picking, setPicking] = useState<DrivePlacementMode | null>(null);
  const [switching, setSwitching] = useState<PlacementChoice | null>(null);
  const localCopy = useLocalCopyNotice(row.computer.deviceId);
  const { placement } = row;
  const deviceId = row.computer.deviceId;
  const closeSwitch = (): void => {
    setSwitching(null);
  };
  return {
    picking,
    switching,
    choose: (choice): void => {
      if (placement === null) setPicking(choice === 'off' ? null : choice);
      else if (choice !== placement.mode) setSwitching(choice);
    },
    repath: (): void => {
      setPicking(placement?.mode ?? null);
    },
    picked: (parent): void => {
      if (picking === null) return;
      change.set(placementBodyOf(deviceId, target, picking, childPath(parent, target.name)));
    },
    confirm: (): void => {
      if (placement === null || switching === null) return;
      if (switching === 'off') {
        change.stop(placement.id, closeSwitch);
        return;
      }
      const body = placementBodyOf(deviceId, target, switching, placement.localPath);
      change.set(body, () => {
        closeSwitch();
        if (placement.mode === 'synced') localCopy(placement.localPath);
      });
    },
    closePicker: (): void => {
      setPicking(null);
    },
    closeSwitch,
  };
}

function MountDemand({
  row,
  children,
}: {
  readonly row: ComputerPlacement;
  readonly children: ReactNode;
}): ReactNode {
  if (row.placement?.mode !== 'mounted' || !row.computer.online) return children;
  return (
    <DemandRegion deviceId={row.computer.deviceId} topics={MOUNT_TOPICS}>
      {children}
    </DemandRegion>
  );
}

function switchFactsOf(
  row: ComputerPlacement,
  target: PlacementTarget,
  to: PlacementChoice | null,
): SwitchFacts | null {
  if (row.placement === null || to === null) return null;
  return {
    placement: row.placement,
    to,
    computer: row.computer.name,
    folderBytes: target.bytes,
    needBytes: row.needBytes,
  };
}

function RowSheets({
  row,
  target,
  flow,
  change,
}: {
  readonly row: ComputerPlacement;
  readonly target: PlacementTarget;
  readonly flow: Flow;
  readonly change: PlacementChange;
}): ReactNode {
  const start = row.placement === null ? null : parentPath(row.placement.localPath);
  return (
    <>
      <FolderPickerSheet
        open={flow.picking !== null}
        mode="folder"
        source={{ kind: 'computer', deviceId: row.computer.deviceId }}
        start={start}
        onClose={flow.closePicker}
        onChoose={flow.picked}
      />
      <PlacementSwitchSheet
        facts={switchFactsOf(row, target, flow.switching)}
        busy={change.busy}
        problem={change.problem}
        onConfirm={flow.confirm}
        onClose={flow.closeSwitch}
      />
    </>
  );
}

function ModeControl({
  row,
  library,
  held,
  flow,
  busy,
}: {
  readonly row: ComputerPlacement;
  readonly library: boolean;
  readonly held: boolean;
  readonly flow: Flow;
  readonly busy: boolean;
}): ReactNode {
  if (held) return null;
  return (
    <Segmented
      label={`${row.computer.name} mode`}
      options={choiceOptionsOf(library)}
      value={choiceOf(row.placement)}
      disabled={busy}
      onChange={flow.choose}
    />
  );
}

function RowDetail({
  row,
  words,
  flow,
  change,
}: {
  readonly row: ComputerPlacement;
  readonly words: PlacementWords | null;
  readonly flow: Flow;
  readonly change: PlacementChange;
}): ReactNode {
  const { placement } = row;
  if (placement === null && change.problem === null) return null;
  return (
    <View className="gap-1 px-4 pb-3">
      {placement === null ? null : (
        <PathLine placement={placement} held={words?.held ?? false} onChange={flow.repath} />
      )}
      {words === null ? null : <PlacementNotes words={words} computer={row.computer.name} />}
      {flow.switching === null ? <ProblemLine change={change} /> : null}
    </View>
  );
}

export function PlacementRow({
  row,
  target,
  live,
}: {
  readonly row: ComputerPlacement;
  readonly target: PlacementTarget;
  readonly live: boolean;
}): ReactNode {
  const change = usePlacementChange();
  const flow = usePlacementFlow(row, target, change);
  const { placement } = row;
  const words = placement === null ? null : placementWordsOf(placement, row.needBytes);
  const stale = isStale(row, live);
  const caption = captionOf(row, stale, useStaleCaption(placement?.status.reportedAt ?? null));
  return (
    <MountDemand row={row}>
      <ListRow
        title={row.computer.name}
        subtitle={words?.line ?? OFF_LINE}
        subtitleTone={stale ? 'faint' : lineToneOf(words)}
        {...(caption === undefined ? {} : { caption })}
        leading={<Lead row={row} words={words} stale={stale} />}
        trailing={
          <ModeControl
            row={row}
            library={target.folderItemId === null}
            held={words?.held ?? false}
            flow={flow}
            busy={change.busy}
          />
        }
      />
      <RowDetail row={row} words={words} flow={flow} change={change} />
      <RowSheets row={row} target={target} flow={flow} change={change} />
    </MountDemand>
  );
}
