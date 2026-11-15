import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DriveItem, DrivePlacement, DrivePlacementSet } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { confirm } from '../../../components/confirm-store';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import type { AppHref } from '../../../components/app-href';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { useDriveItem, useDriveRoots, useViewerId } from '../data';
import { mountOpenable } from './mount-summary';
import { usePlacementWrites, type PlacementWrites } from './placement-change';
import { changedBodyOf, drivePathOf, locationOf, type DriveNames } from './placement-model';
import {
  MODE_ICON,
  lineToneOf,
  placementWordsOf,
  sentenceOf,
  syncedShareOf,
  type PlacementWords,
} from './placement-words';
import { useDesktopDrive, useThisComputer } from './this-computer';

export interface PlacedFolder {
  readonly path: string;
  readonly folder: DriveItem | null;
  readonly bytes: number | null;
}

export function useDriveNames(): DriveNames {
  return { roots: useDriveRoots(), viewerId: useViewerId() };
}

export function usePlacedFolder(placement: DrivePlacement): PlacedFolder {
  const names = useDriveNames();
  const folder = useDriveItem(placement.folderItemId, placement.rootId).data ?? null;
  const root = names.roots.find((candidate) => candidate.id === placement.rootId);
  const size = placement.folderItemId === null ? (root?.bytes ?? null) : (folder?.bytes ?? null);
  return { path: drivePathOf(placement, folder, names), folder, bytes: size };
}

export function removePlacement(
  placement: DrivePlacement,
  writes: PlacementWrites,
  onDone?: () => void,
): void {
  const location = locationOf(placement);
  const body =
    placement.mode === 'synced'
      ? `The files stay in ${location ?? 'the folder'} on this computer; they stop syncing.`
      : 'My Drive is unmounted. Nothing in the drive is deleted.';
  background(
    confirm({
      title: placement.mode === 'synced' ? 'Stop syncing this folder?' : 'Unmount My Drive?',
      body,
      confirmLabel: 'Remove',
      tone: 'destructive',
    }).then((accepted) => {
      if (accepted) writes.remove(placement.id, onDone);
    }),
    'drive.placement.remove_confirm_failed',
  );
}

function Lead({ placement }: { readonly placement: DrivePlacement }): ReactNode {
  return (
    <IconWell
      icon={MODE_ICON[placement.mode]}
      colour={placement.mode === 'synced' ? 'primary' : 'viz-blue'}
      size="m"
    />
  );
}

function Progress({
  placement,
  folderBytes,
}: {
  readonly placement: DrivePlacement;
  readonly folderBytes: number | null;
}): ReactNode {
  if (placement.mode !== 'synced' || placement.status.state !== 'syncing') return null;
  return (
    <ProgressBar
      progress={syncedShareOf(placement.status.needBytes, folderBytes)}
      colour="info"
      label={`${bytes(placement.status.needBytes)} left to sync`}
    />
  );
}

function menuItemsOf(
  placement: DrivePlacement,
  writes: PlacementWrites,
  live: boolean,
  open: (to: AppHref) => void,
): readonly MenuItem[] {
  return [
    {
      label: 'Details',
      icon: 'info',
      onPress: (): void => {
        open(href.drivePlacement(placement.id));
      },
    },
    {
      label: 'Remove',
      icon: 'trash',
      destructive: true,
      disabled: !live || writes.busy,
      onPress: (): void => {
        removePlacement(placement, writes);
      },
    },
  ];
}

export function PlacementLocation({
  placement,
}: {
  readonly placement: DrivePlacement;
}): ReactNode {
  const location = locationOf(placement);
  if (location === null) return null;
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1} className="font-mono" selectable>
      {location}
    </Text>
  );
}

export interface OpenHereAction {
  readonly busy: boolean;
  readonly open: () => void;
}

export function useOpenHere(placement: DrivePlacement | null): OpenHereAction | null {
  const here = useThisComputer();
  const drive = useDesktopDrive();
  if (
    placement === null ||
    here?.deviceId !== placement.deviceId ||
    drive === null ||
    !mountOpenable(placement)
  ) {
    return null;
  }
  return {
    busy: drive.busy,
    open: (): void => {
      drive.open(placement.id);
    },
  };
}

export function OpenHereButton({ action }: { readonly action: OpenHereAction }): ReactNode {
  return (
    <Button
      label="Open in file manager"
      icon="externalLink"
      variant="text"
      loading={action.busy}
      onPress={action.open}
    />
  );
}

export interface PlacementReach {
  readonly online: boolean;
  readonly live: boolean;
}

export function pauseBodyOf(placement: DrivePlacement): DrivePlacementSet {
  return changedBodyOf(placement, { enabled: !placement.enabled });
}

export function pauseFailureOf(placement: DrivePlacement): string {
  return placement.enabled ? 'The folder was not paused' : 'The folder did not resume';
}

function Actions({
  placement,
  words,
  writes,
  reach,
}: {
  readonly placement: DrivePlacement;
  readonly words: PlacementWords;
  readonly writes: PlacementWrites;
  readonly reach: PlacementReach;
}): ReactNode {
  const router = useRouter();
  const paused = !placement.enabled;
  const location = locationOf(placement);
  const openHere = useOpenHere(placement);
  return (
    <View className="flex-row flex-wrap items-center gap-1">
      {openHere === null ? null : <OpenHereButton action={openHere} />}
      {location === null || !reach.online || !reach.live ? null : (
        <Button
          label="Open on computer"
          icon="folder"
          variant="text"
          href={href.settings.device(placement.deviceId, 'files', { path: location })}
        />
      )}
      <IconButton
        icon={paused ? 'play' : 'pause'}
        label={paused ? 'Resume' : 'Pause'}
        disabled={writes.busy || words.held || !reach.live}
        onPress={() => {
          writes.set([pauseBodyOf(placement)], pauseFailureOf(placement));
        }}
      />
      <OverflowButton
        label={`More for ${location ?? 'this folder'}`}
        items={menuItemsOf(placement, writes, reach.live, (to) => {
          router.push(to);
        })}
      />
    </View>
  );
}

function Heading({
  placement,
  placed,
  words,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly words: PlacementWords;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 basis-56 gap-0.5">
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
          {placed.path}
        </Text>
        <Badge label={words.chip.label} tone={words.chip.tone} />
      </View>
      <PlacementLocation placement={placement} />
      <Text variant="footnote" tone={lineToneOf(words)} numberOfLines={2}>
        {sentenceOf(placement.mode, words)}
      </Text>
      <Progress placement={placement} folderBytes={placed.bytes} />
    </View>
  );
}

export function PlacementRow({
  placement,
  reach,
  divided,
}: {
  readonly placement: DrivePlacement;
  readonly reach: PlacementReach;
  readonly divided: boolean;
}): ReactNode {
  const placed = usePlacedFolder(placement);
  const writes = usePlacementWrites();
  const words = placementWordsOf(placement, placed.bytes);
  return (
    <View
      className={cn(
        'flex-row items-start gap-3 py-3',
        divided && 'border-t border-outline-variant',
      )}
    >
      <Lead placement={placement} />
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row flex-wrap items-start gap-x-3 gap-y-1">
          <Heading placement={placement} placed={placed} words={words} />
          <Actions placement={placement} words={words} writes={writes} reach={reach} />
        </View>
        {writes.problem === null ? null : (
          <Text variant="footnote" tone="critical">
            {writes.problem}
          </Text>
        )}
      </View>
    </View>
  );
}
