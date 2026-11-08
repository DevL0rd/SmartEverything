import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement, DriveRoot, DriveSyncClient } from '@smarteverything/domain';
import { NavRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { bytes } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { useLoaded, useRows, useSyncStatus } from '../../../store/selectors';
import { useDriveRoots, useDriveSyncClients } from '../../nas/data';
import { MOUNT_LOG_HREF, sendPlacements } from '../mount/mount-actions';
import {
  setupOf,
  thisMountOf,
  tierWordOf,
  toggleBodiesOf,
  type ThisMount,
} from '../mount/mount-model';
import { MountSetupSteps } from '../mount/mount-setup-steps';
import { ThisComputerOnly, type ThisComputer } from '../mount/this-computer';
import { MountDemand } from '../mount/this-computer-mount';
import { pauseBodiesOf, sendPause, thisComputerViewOf } from '../sync/this-computer-card';
import { DriveSettingsSection } from './page';
import { NoneHere, PlacementPathRow, rootNameOf } from './sync-mount-rows';

export const SYNC_FOOTER =
  'Sync and mount settings belong to this computer. Other computers set their own in their Desktop app.';

export const MOUNT_FOOTER = 'Unmounting keeps synced folders and the cache on this computer.';

export const NO_SYNCED =
  'No synced folders here. Open a library folder and choose Use on a computer.';

export const NO_MOUNT =
  'Not mounted here. Open a library folder, choose Use on a computer, then Mounted only.';

export function tierLineOf(mount: ThisMount): string {
  if (mount.tier === 'basic') return 'A network place in the file manager, nothing to install';
  if (mount.tier === 'full') return 'A real folder: programs open files in place, big files stream';
  return 'Shows once the drive is mounted';
}

export function needOf(clients: readonly DriveSyncClient[], placement: DrivePlacement): number {
  return clients
    .filter(
      (client) => client.deviceId === placement.deviceId && client.rootId === placement.rootId,
    )
    .reduce((all, client) => all + client.needBytes, 0);
}

interface Facts {
  readonly computer: ThisComputer;
  readonly placements: readonly DrivePlacement[];
  readonly roots: readonly DriveRoot[];
  readonly clients: readonly DriveSyncClient[];
  readonly live: boolean;
}

function SyncList({ facts }: { readonly facts: Facts }): ReactNode {
  const mutation = useMutationState();
  const view = thisComputerViewOf(
    facts.computer.deviceId,
    facts.placements,
    facts.roots,
    facts.clients,
  );
  const none = view.synced.length === 0;
  return (
    <List title="Sync" footer={SYNC_FOOTER}>
      <SwitchRow
        title="Sync on this computer"
        icon="folderSync"
        subtitle={view.state.text}
        wrapSubtitle
        value={!none && !view.paused}
        disabled={none || mutation.busy || !facts.live}
        onChange={(next) => {
          mutation.run(() => sendPause(pauseBodiesOf(view.synced, next)), {
            failure: next ? 'Syncing did not resume' : 'Syncing was not paused',
            label: 'drive.sync_mount.sync',
          });
        }}
      />
      {none ? <NoneHere text={NO_SYNCED} /> : null}
      {view.synced.map((placement) => (
        <PlacementPathRow
          key={placement.id}
          placement={placement}
          name={rootNameOf(placement, facts.roots)}
          needBytes={needOf(facts.clients, placement)}
        />
      ))}
    </List>
  );
}

function MountSwitch({
  mount,
  live,
}: {
  readonly mount: ThisMount;
  readonly live: boolean;
}): ReactNode {
  const mutation = useMutationState();
  return (
    <SwitchRow
      title="Mount the drive"
      icon="hardDrive"
      subtitle={mount.line.text}
      wrapSubtitle
      value={mount.enabled}
      disabled={mount.placements.length === 0 || mutation.busy || !live}
      onChange={(next) => {
        const bodies = toggleBodiesOf(mount.placements, next);
        mutation.run(() => sendPlacements(bodies, 'mount.settings_set'), {
          failure: next ? 'The drive was not mounted' : 'The drive was not unmounted',
          label: 'drive.sync_mount.mount',
        });
      }}
    />
  );
}

function MountList({
  facts,
  mount,
}: {
  readonly facts: Facts;
  readonly mount: ThisMount;
}): ReactNode {
  return (
    <List title="Mounted drive" footer={MOUNT_FOOTER}>
      <MountSwitch mount={mount} live={facts.live} />
      <ValueRow
        title="Drive type"
        icon="layers"
        subtitle={tierLineOf(mount)}
        wrapSubtitle
        value={tierWordOf(mount.tier, mount.readOnly) ?? 'Not mounted'}
      />
      {mount.placements.length === 0 ? <NoneHere text={NO_MOUNT} /> : null}
      {mount.placements.map((placement) => (
        <PlacementPathRow
          key={placement.id}
          placement={placement}
          name={rootNameOf(placement, facts.roots)}
          needBytes={0}
        />
      ))}
      {mount.tier === 'full' ? (
        <ValueRow title="Kept offline" icon="pin" value={bytes(mount.pinnedBytes)} />
      ) : null}
      <NavRow
        title="Mount log"
        icon="fileText"
        subtitle="The computer service log"
        href={MOUNT_LOG_HREF}
      />
    </List>
  );
}

function SyncMountBody({ computer }: { readonly computer: ThisComputer }): ReactNode {
  const loaded = useLoaded();
  const facts: Facts = {
    computer,
    placements: useRows('drive_placements'),
    roots: useDriveRoots(),
    clients: useDriveSyncClients(),
    live: useSyncStatus().status === 'live',
  };
  if (!loaded) return <Skeleton shape="block" />;
  const mount = thisMountOf(computer.deviceId, facts.placements);
  const setup = setupOf(computer.platform, mount);
  return (
    <View className="gap-6">
      <SyncList facts={facts} />
      <MountDemand deviceId={computer.deviceId} mount={mount}>
        <MountList facts={facts} mount={mount} />
      </MountDemand>
      {setup === null ? null : <MountSetupSteps setup={setup} command={null} />}
    </View>
  );
}

export function SyncMountSection(): ReactNode {
  return (
    <DriveSettingsSection section="sync-mount">
      <ThisComputerOnly>{(computer) => <SyncMountBody computer={computer} />}</ThisComputerOnly>
    </DriveSettingsSection>
  );
}
