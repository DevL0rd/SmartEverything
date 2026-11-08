import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { CardGrid } from '../../../components/card-grid';
import { EmptyState } from '../../../components/empty-state';
import { gridColumnsOf } from '../../../components/frame-layout';
import type { HeaderAction } from '../../../components/page-header';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Skeleton } from '../../../components/skeleton';
import { useDevices, useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { PairComputerSheet } from '../../computers';
import { DriveFrame } from '../components/drive-frame';
import { ComputerCard } from './computer-card';
import { computersOf, computersSubtitleOf } from './computers-model';

export interface ComputersSlots {
  readonly top?: ReactNode;
}

const NO_ACTIONS: readonly HeaderAction[] = [];

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
          ? 'Pair a computer to sync library folders to it or open the drive in its file manager.'
          : 'The owner of the home pairs computers. Yours shows here once it is paired.'
      }
      {...(owner ? { action: <Button label="Pair a computer" icon="plus" onPress={pair} /> } : {})}
    />
  );
}

function StaleBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Showing the last known state"
      body="The hub is offline. Computers update when it is back."
    />
  );
}

function ComputerCards({ computers }: { readonly computers: readonly Device[] }): ReactNode {
  return (
    <CardGrid
      items={computers}
      columns={gridColumnsOf(useFrameBodyWidth())}
      keyOf={(device) => device.id}
      render={(device) => <ComputerCard device={device} />}
    />
  );
}

interface BodyProps {
  readonly loaded: boolean;
  readonly computers: readonly Device[];
  readonly owner: boolean;
  readonly pair: () => void;
  readonly slots: ComputersSlots;
}

function ComputersBody({ loaded, computers, owner, pair, slots }: BodyProps): ReactNode {
  if (!loaded) return <ComputersSkeleton />;
  return (
    <View className="gap-4">
      {slots.top}
      {computers.length === 0 ? (
        <NoComputers owner={owner} pair={pair} />
      ) : (
        <ComputerCards computers={computers} />
      )}
    </View>
  );
}

export function ComputersScreen({ slots = {} }: { readonly slots?: ComputersSlots }): ReactNode {
  const owner = useIsOwner();
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const computers = computersOf(useDevices());
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
      banner={loaded && !live ? <StaleBanner /> : null}
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <ComputersBody
        loaded={loaded}
        computers={computers}
        owner={owner}
        pair={pair}
        slots={slots}
      />
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
