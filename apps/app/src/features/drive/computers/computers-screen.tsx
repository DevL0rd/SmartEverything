import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { useDevices, useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { PairComputerSheet } from '../../computers';
import { useDrivePlacementRows } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { ComputerCard } from './computer-card';
import { computersOf, computersSubtitleOf } from './computers-model';
import { ConflictsCard } from './conflicts-card';
import { FirstRunCard } from './first-run-card';
import { MountPanel } from './mount-panel';
import { mountSummaryOf } from './mount-summary';
import { placementsOn } from './placement-model';
import {
  useDesktopDrive,
  useThisComputer,
  type DesktopDriveView,
  type ThisComputer,
} from './this-computer';

const NO_ACTIONS: readonly HeaderAction[] = [];

export const MEMBER_PAIRING =
  'Open SmartEverything Desktop on your computer and sign in. The home owner then pairs it under Computers, and it shows here.';

export function pairActionsOf(owner: boolean, pair: () => void): readonly HeaderAction[] {
  return owner ? [{ icon: 'plus', label: 'Pair a computer', onPress: pair }] : NO_ACTIONS;
}

export function ComputersSkeleton(): ReactNode {
  return (
    <View aria-busy className="gap-4">
      <Skeleton shape="tile" className="h-64" />
      <Skeleton shape="tile" className="h-64" />
    </View>
  );
}

function NoComputers({
  owner,
  pair,
}: {
  readonly owner: boolean;
  readonly pair: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="laptop"
      title="No computers yet"
      body={
        owner
          ? 'Pair a computer to sync folders of your drives to it or mount them in its file manager.'
          : MEMBER_PAIRING
      }
      {...(owner ? { action: <Button label="Pair a computer" icon="plus" onPress={pair} /> } : {})}
    />
  );
}

export function ThisComputerCard({
  device,
  here,
  drive,
  placements,
}: {
  readonly device: Device;
  readonly here: ThisComputer;
  readonly drive: DesktopDriveView;
  readonly placements: readonly DrivePlacement[];
}): ReactNode {
  return (
    <ComputerCard device={device} placements={placementsOn(device.id, placements)} here>
      <MountPanel
        platform={here.platform}
        summary={mountSummaryOf(device.id, placements)}
        drive={drive}
      />
    </ComputerCard>
  );
}

function ComputerCards({ computers }: { readonly computers: readonly Device[] }): ReactNode {
  const placements = useDrivePlacementRows();
  const here = useThisComputer();
  const drive = useDesktopDrive();
  return (
    <View className="gap-4">
      {here === null || drive === null ? null : (
        <FirstRunCard deviceId={here.deviceId} drive={drive} />
      )}
      {computers.map((device) =>
        here !== null && drive !== null && device.id === here.deviceId ? (
          <ThisComputerCard
            key={device.id}
            device={device}
            here={here}
            drive={drive}
            placements={placements}
          />
        ) : (
          <ComputerCard
            key={device.id}
            device={device}
            placements={placementsOn(device.id, placements)}
          />
        ),
      )}
    </View>
  );
}

function ComputersBody({
  loaded,
  computers,
  owner,
  pair,
}: {
  readonly loaded: boolean;
  readonly computers: readonly Device[];
  readonly owner: boolean;
  readonly pair: () => void;
}): ReactNode {
  if (!loaded) return <ComputersSkeleton />;
  return (
    <View className="gap-4">
      <ConflictsCard />
      {computers.length === 0 ? (
        <NoComputers owner={owner} pair={pair} />
      ) : (
        <ComputerCards computers={computers} />
      )}
    </View>
  );
}

export function ComputersScreen(): ReactNode {
  const owner = useIsOwner();
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const here = useThisComputer();
  const computers = computersOf(useDevices(), here?.deviceId ?? null);
  const [pairing, setPairing] = useState(false);
  const pair = (): void => {
    setPairing(true);
  };
  const subtitle = computersSubtitleOf(computers);
  return (
    <DriveFrame
      section="computers"
      title="Computers"
      actions={pairActionsOf(owner, pair)}
      banner={
        loaded && !live ? (
          <Banner
            wrapBody
            tone="info"
            title="Showing the last known state"
            body="The Hub is offline. Computers update when it is back."
          />
        ) : null
      }
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <ComputersBody loaded={loaded} computers={computers} owner={owner} pair={pair} />
      {owner ? (
        <PairComputerSheet
          open={pairing}
          onClose={() => {
            setPairing(false);
          }}
        />
      ) : null}
    </DriveFrame>
  );
}
