import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot } from '@smarteverything/domain';
import type { DriveResult } from '../../../api/drive';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { List, Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { FolderPickerSheet } from '../../computers';

export type DriveVolumeEntry = DriveResult<'listVolumes'>[number];

type VolumeKind = 'disk' | 'network';

export interface VolumeChoice {
  readonly volume: DriveVolumeEntry;
  readonly detail: string;
  readonly note: string | null;
  readonly takenBy: string | null;
  readonly segments: readonly BarSegment[];
}

export interface VolumeGroup {
  readonly kind: VolumeKind;
  readonly title: string;
  readonly choices: readonly VolumeChoice[];
}

const GROUP_TITLE: Readonly<Record<VolumeKind, string>> = {
  disk: 'Disks on the hub',
  network: 'Network shares',
};

const GROUP_ICON: Readonly<Record<VolumeKind, IconName>> = {
  disk: 'hardDrive',
  network: 'network',
};

const KIND_ORDER: readonly VolumeKind[] = ['disk', 'network'];

export function folderNameOf(path: string): string {
  const parts = path.split('/').filter((part) => part !== '');
  return parts.at(-1) ?? path;
}

function inside(path: string, mountPoint: string): boolean {
  const base = mountPoint.endsWith('/') ? mountPoint : `${mountPoint}/`;
  return path === mountPoint || path.startsWith(base);
}

export function volumeOfPath(
  path: string,
  volumes: readonly DriveVolumeEntry[],
): DriveVolumeEntry | null {
  const holding = volumes.filter((volume) => inside(path, volume.mountPoint));
  return holding.reduce<DriveVolumeEntry | null>(
    (best, volume) =>
      best === null || volume.mountPoint.length > best.mountPoint.length ? volume : best,
    null,
  );
}

function kindOf(volume: DriveVolumeEntry): VolumeKind {
  return volume.network ? 'network' : 'disk';
}

export function volumeChoiceOf(
  volume: DriveVolumeEntry,
  roots: readonly DriveRoot[],
): VolumeChoice {
  const onVolume = roots.filter((root) => volume.rootIds.includes(root.id));
  const whole = onVolume.find((root) => root.kind === 'volume') ?? null;
  const inDrive = onVolume.reduce((sum, root) => sum + root.bytes, 0);
  const used = Math.max(0, volume.totalBytes - volume.freeBytes);
  return {
    volume,
    detail: joinParts([
      volume.fsType,
      `${bytes(volume.freeBytes)} free of ${bytes(volume.totalBytes)}`,
    ]),
    note:
      whole === null && onVolume.length > 0
        ? `${plural(onVolume.length, 'library folder')} here`
        : null,
    takenBy: whole?.label ?? null,
    segments: [
      { label: 'In Drive', value: Math.min(inDrive, used), colour: 'primary' },
      { label: 'Other files', value: Math.max(0, used - inDrive), colour: 'track' },
    ],
  };
}

export function volumeGroupsOf(
  volumes: readonly DriveVolumeEntry[],
  roots: readonly DriveRoot[],
): readonly VolumeGroup[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    title: GROUP_TITLE[kind],
    choices: volumes
      .filter((volume) => kindOf(volume) === kind)
      .map((volume) => volumeChoiceOf(volume, roots)),
  })).filter((group) => group.choices.length > 0);
}

function VolumeText({ choice }: { readonly choice: VolumeChoice }): ReactNode {
  const { volume, detail, note, takenBy } = choice;
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="body" className="font-mono" numberOfLines={1}>
        {volume.mountPoint}
      </Text>
      <Text variant="callout" tone="variant" className="tabular" numberOfLines={1}>
        {takenBy === null ? joinParts([detail, note]) : `Already in Drive as ${takenBy}`}
      </Text>
      <SegmentBar
        segments={choice.segments}
        total={volume.totalBytes}
        size="thin"
        label={`${volume.mountPoint} space`}
        format={bytes}
      />
    </View>
  );
}

function VolumeRow({
  choice,
  icon,
  selected,
  onSelect,
}: {
  readonly choice: VolumeChoice;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onSelect: (mountId: string) => void;
}): ReactNode {
  const taken = choice.takenBy !== null;
  return (
    <Interactive
      role="radio"
      checked={selected}
      disabled={taken}
      label={choice.volume.mountPoint}
      onPress={() => {
        onSelect(choice.volume.mountId);
      }}
      className={cn(
        'min-h-row-h-2 flex-row items-center gap-4 px-4 py-2',
        selected && 'bg-primary-container',
        taken && 'opacity-40',
      )}
    >
      <View className="size-8 items-center justify-center rounded-sm bg-surface-3">
        <Icon name={icon} size={16} tone={selected ? 'primary' : 'variant'} />
      </View>
      <VolumeText choice={choice} />
      <View className="size-5 items-center justify-center">
        {selected ? <Icon name="check" size={20} tone="primary" /> : null}
      </View>
    </Interactive>
  );
}

export function VolumePicker({
  groups,
  selected,
  onSelect,
}: {
  readonly groups: readonly VolumeGroup[];
  readonly selected: string | null;
  readonly onSelect: (mountId: string) => void;
}): ReactNode {
  return (
    <View role="radiogroup" aria-label="Disk" className="gap-3">
      {groups.map((group) => (
        <Section key={group.kind} title={group.title}>
          <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
            {group.choices.map((choice, index) => (
              <View
                key={choice.volume.mountId}
                className={cn(index > 0 && 'border-t-hairline border-outline-variant')}
              >
                <VolumeRow
                  choice={choice}
                  icon={GROUP_ICON[group.kind]}
                  selected={choice.volume.mountId === selected}
                  onSelect={onSelect}
                />
              </View>
            ))}
          </View>
        </Section>
      ))}
    </View>
  );
}

function FolderRows({
  path,
  folder,
  onPick,
  onWhole,
}: {
  readonly path: string;
  readonly folder: string | null;
  readonly onPick: () => void;
  readonly onWhole: () => void;
}): ReactNode {
  return (
    <List title="Folder">
      <ListRow
        title={folder === null ? 'The whole disk' : folderNameOf(folder)}
        subtitle={path}
        icon={folder === null ? 'hardDrive' : 'folder'}
        chevron
        label="Choose a folder"
        onPress={onPick}
      />
      {folder === null ? null : (
        <ListRow title="Use the whole disk" icon="hardDrive" onPress={onWhole} />
      )}
    </List>
  );
}

export interface PlaceChoice {
  readonly mountId: string | null;
  readonly folder: string | null;
}

export function FolderChoice({
  place,
  volumes,
  onChange,
}: {
  readonly place: PlaceChoice;
  readonly volumes: readonly DriveVolumeEntry[];
  readonly onChange: (place: Partial<PlaceChoice>) => void;
}): ReactNode {
  const [picking, setPicking] = useState(false);
  const volume = volumes.find((entry) => entry.mountId === place.mountId) ?? null;
  if (volume === null) return null;
  const path = place.folder ?? volume.mountPoint;
  const choose = (chosen: string): void => {
    const holder = volumeOfPath(chosen, volumes);
    onChange({
      mountId: holder?.mountId ?? place.mountId,
      folder: holder?.mountPoint === chosen ? null : chosen,
    });
  };
  return (
    <>
      <FolderRows
        path={path}
        folder={place.folder}
        onPick={() => {
          setPicking(true);
        }}
        onWhole={() => {
          onChange({ folder: null });
        }}
      />
      <FolderPickerSheet
        open={picking}
        mode="folder"
        source={{ kind: 'hub' }}
        start={path}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={choose}
      />
    </>
  );
}
