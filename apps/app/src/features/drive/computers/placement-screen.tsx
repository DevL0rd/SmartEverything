import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DrivePlacement } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { count } from '../../../format/number';
import { joinParts, sentenceCase } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useFirstDevice, useLoaded, useSyncStatus } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDrivePlacementRows } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { usePlacementWrites, type PlacementWrites } from './placement-change';
import { locationOf } from './placement-model';
import {
  pauseBodyOf,
  pauseFailureOf,
  removePlacement,
  usePlacedFolder,
  type PlacedFolder,
} from './placement-row';
import { SelectiveSync, SyncRules } from './placement-sync';
import { placementWordsOf, type PlacementWords } from './placement-words';
import { ComputersSkeleton } from './computers-screen';
import { Hero } from './placement-hero';

const COMPUTERS_CRUMB = { label: 'Computers', href: href.drivePage('computers') } as const;

function crumbsOf(device: Device | null, path: string): readonly Crumb[] {
  if (device === null) return [COMPUTERS_CRUMB, { label: path }];
  return [
    COMPUTERS_CRUMB,
    { label: device.label, href: href.driveComputer(device.id) },
    { label: path },
  ];
}

function FailedBanner({
  placement,
  device,
}: {
  readonly placement: DrivePlacement;
  readonly device: Device | null;
}): ReactNode {
  if (placement.status.state !== 'failed' || placement.hold !== null || !placement.enabled) {
    return null;
  }
  const location = locationOf(placement);
  const computer = device === null ? 'the computer' : device.label;
  const reachable = location !== null && device?.online === true;
  return (
    <Banner
      tone="critical"
      title={`Sync stopped on ${computer}`}
      body={
        reachable
          ? `Open the folder on ${computer} to fix the problem.`
          : `Fix the problem on ${computer} when it is back online.`
      }
      wrapBody
      {...(reachable
        ? {
            action: {
              label: 'Open on computer',
              icon: 'folder',
              variant: 'tonal',
              href: href.settings.device(placement.deviceId, 'files', { path: location }),
            },
          }
        : {})}
    />
  );
}

function Errors({ placement }: { readonly placement: DrivePlacement }): ReactNode {
  const now = useMinute();
  const { errors } = placement.status;
  if (errors.length === 0) return null;
  return (
    <List title="Problems" caption={count(errors.length)}>
      {errors.map((error) => (
        <ListRow
          key={`${error.relPath ?? ''}-${error.at}`}
          title={error.relPath ?? 'The whole folder'}
          subtitle={error.message}
          subtitleTone="critical"
          caption={sentenceCase(moment(error.at, now))}
          leading={<IconWell icon="warning" colour="critical" />}
          wrapSubtitle
        />
      ))}
    </List>
  );
}

function SyncSections({
  placement,
  placed,
  editable,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly editable: boolean;
}): ReactNode {
  if (placement.mode !== 'synced') return null;
  const located = placement.folderItemId === null || placed.folder !== null;
  return (
    <>
      {located ? (
        <SelectiveSync
          key={(placement.excluded ?? []).join('\n')}
          placement={placement}
          base={placed.folder}
          name={placed.folder === null ? placed.path : placed.folder.name}
          size={placed.bytes}
          editable={editable}
        />
      ) : null}
      <SyncRules placement={placement} editable={editable} />
    </>
  );
}

function offlineBannerOf(device: Device | null): { readonly banner?: ReactNode } {
  if (device?.online !== false) return {};
  return {
    banner: (
      <Banner
        wrapBody
        tone="info"
        title={`${device.label} is offline`}
        body="Showing the last state it reported."
      />
    ),
  };
}

export interface PlacementMenuInputs {
  readonly placement: DrivePlacement;
  readonly words: PlacementWords;
  readonly online: boolean;
  readonly live: boolean;
  readonly busy: boolean;
}

export function placementMenuOf(
  inputs: PlacementMenuInputs,
  act: {
    readonly pause: () => void;
    readonly open: (location: string) => void;
    readonly remove: () => void;
  },
): readonly MenuItem[] {
  const { placement, words } = inputs;
  const location = locationOf(placement);
  const paused = !placement.enabled;
  return [
    {
      label: paused ? 'Resume' : 'Pause',
      icon: paused ? 'play' : 'pause',
      disabled: words.held || inputs.busy || !inputs.live,
      onPress: act.pause,
    },
    ...(location === null
      ? []
      : [
          {
            label: 'Open on computer',
            icon: 'folder' as const,
            disabled: !inputs.online || !inputs.live,
            onPress: (): void => {
              act.open(location);
            },
          },
        ]),
    {
      label: 'Remove from this computer',
      icon: 'trash',
      destructive: true,
      disabled: inputs.busy || !inputs.live,
      onPress: act.remove,
    },
  ];
}

function usePlacementMenu(
  placement: DrivePlacement,
  words: PlacementWords,
  device: Device | null,
  writes: PlacementWrites,
): readonly MenuItem[] {
  const router = useRouter();
  const live = useSyncStatus().status === 'live';
  return placementMenuOf(
    { placement, words, online: device?.online === true, live, busy: writes.busy },
    {
      pause: () => {
        writes.set([pauseBodyOf(placement)], pauseFailureOf(placement));
      },
      open: (location) => {
        router.push(href.settings.device(placement.deviceId, 'files', { path: location }));
      },
      remove: () => {
        removePlacement(placement, writes, () => {
          router.replace(href.driveComputer(placement.deviceId));
        });
      },
    },
  );
}

function headerOf(
  placed: PlacedFolder,
  device: Device | null,
  crumbs: boolean,
): { readonly title: string; readonly subtitle?: string } {
  const title = placed.folder === null ? placed.path : placed.folder.name;
  if (crumbs) return { title };
  return { title, subtitle: joinParts([placed.path, device === null ? null : device.label]) };
}

function PlacedView({
  placement,
  device,
}: {
  readonly placement: DrivePlacement;
  readonly device: Device | null;
}): ReactNode {
  const placed = usePlacedFolder(placement);
  const writes = usePlacementWrites();
  const words = placementWordsOf(placement, placed.bytes);
  const editable = !words.held && !placement.status.readOnly;
  const crumbs = useSizeClass().header === 'desktop';
  return (
    <DriveFrame
      section="computers"
      {...headerOf(placed, device, crumbs)}
      breadcrumbs={crumbsOf(device, placed.path)}
      overflow={usePlacementMenu(placement, words, device, writes)}
      {...offlineBannerOf(device)}
    >
      <View className="gap-4">
        <Hero placement={placement} placed={placed} words={words} />
        {writes.problem === null ? null : (
          <Text variant="footnote" tone="critical" className="px-4">
            {writes.problem}
          </Text>
        )}
        <FailedBanner placement={placement} device={device} />
        <Errors placement={placement} />
        <SyncSections placement={placement} placed={placed} editable={editable} />
      </View>
    </DriveFrame>
  );
}

export function PlacementScreen(): ReactNode {
  const { placementId } = useLocalSearchParams<{ placementId: string }>();
  const loaded = useLoaded();
  const placement = useDrivePlacementRows().find(
    (candidate) => candidate.id === placementId && candidate.mode === 'synced',
  );
  const device = useFirstDevice((candidate) => candidate.id === placement?.deviceId);
  if (placement !== undefined) {
    return <PlacedView placement={placement} device={device} />;
  }
  return (
    <DriveFrame section="computers" title="Folder on a computer" breadcrumbs={[COMPUTERS_CRUMB]}>
      {loaded ? (
        <EmptyState
          icon="folderSync"
          title="This folder is no longer on the computer"
          body="It was removed. The files are still in the drive."
          action={
            <Button label="Open Computers" variant="tonal" href={href.drivePage('computers')} />
          }
        />
      ) : (
        <ComputersSkeleton />
      )}
    </DriveFrame>
  );
}
