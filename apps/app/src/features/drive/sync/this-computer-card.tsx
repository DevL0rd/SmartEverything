import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  API_ENDPOINTS as E,
  DESKTOP_COMPUTER_IDENTITY,
  type DrivePlacement,
  type DrivePlacementSet,
  type DriveRoot,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { STATUS_FILL, type StatusTone } from '../../../components/tone';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { joinParts, plural } from '../../../format/text';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMutationState } from '../../../store/mutation';
import { useDevice, useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDriveRoots, useDriveSyncClients } from '../../nas/data';
import { mountLineOf, osLineOf, type SyncLine } from '../computers/computers-model';
import { placementWordsOf, type PlacementTone } from '../placements/placement-status';
import { DRIVE_SETTINGS_PAGE, driveSettingsSection } from '../settings/sections';

const log = new Logger('app.drive');

export const IDENTITY_KEY = ['window', 'desktop-computer-identity'] as const;

export interface ThisComputerFolder {
  readonly key: string;
  readonly name: string;
  readonly path: string;
  readonly line: string;
  readonly tone: PlacementTone;
}

export interface ThisComputerView {
  readonly folders: readonly ThisComputerFolder[];
  readonly mount: SyncLine;
  readonly state: SyncLine;
  readonly paused: boolean;
  readonly synced: readonly DrivePlacement[];
}

const TONE_RANK: Readonly<Record<StatusTone | 'none', number>> = {
  none: 0,
  positive: 1,
  info: 2,
  warning: 3,
  critical: 4,
};

function rankOf(tone: PlacementTone): number {
  return TONE_RANK[tone ?? 'none'];
}

function needOf(clients: readonly DriveSyncClient[], placement: DrivePlacement): number {
  return clients
    .filter(
      (client) => client.deviceId === placement.deviceId && client.rootId === placement.rootId,
    )
    .reduce((all, client) => all + client.needBytes, 0);
}

function folderOf(
  placement: DrivePlacement,
  roots: readonly DriveRoot[],
  clients: readonly DriveSyncClient[],
): ThisComputerFolder {
  const words = placementWordsOf(placement, needOf(clients, placement));
  return {
    key: placement.id,
    name: roots.find((root) => root.id === placement.rootId)?.label ?? 'Library folder',
    path: placement.localPath,
    line: words.line,
    tone: words.tone,
  };
}

function stateOf(folders: readonly ThisComputerFolder[], paused: boolean): SyncLine {
  if (folders.length === 0) return { text: 'Keeps no synced folders here', tone: null };
  if (paused) return { text: 'Paused', tone: null };
  const worst = folders.reduce((best, next) =>
    rankOf(next.tone) > rankOf(best.tone) ? next : best,
  );
  return { text: worst.line, tone: worst.tone };
}

export function thisComputerViewOf(
  deviceId: string,
  placements: readonly DrivePlacement[],
  roots: readonly DriveRoot[],
  clients: readonly DriveSyncClient[],
): ThisComputerView {
  const synced = placements.filter(
    (placement) => placement.deviceId === deviceId && placement.mode === 'synced',
  );
  const folders = synced.map((placement) => folderOf(placement, roots, clients));
  const paused = synced.length > 0 && synced.every((placement) => !placement.enabled);
  return {
    folders,
    mount: mountLineOf(deviceId, placements),
    state: stateOf(folders, paused),
    paused,
    synced,
  };
}

export function pauseBodiesOf(
  synced: readonly DrivePlacement[],
  enabled: boolean,
): readonly DrivePlacementSet[] {
  return synced
    .filter((placement) => placement.enabled !== enabled)
    .map((placement) => ({
      deviceId: placement.deviceId,
      rootId: placement.rootId,
      folderItemId: placement.folderItemId,
      mode: placement.mode,
      localPath: placement.localPath,
      enabled,
    }));
}

export async function sendPause(bodies: readonly DrivePlacementSet[]): Promise<void> {
  await Promise.all(bodies.map((body) => api().call(E.setPlacement, { body })));
  log.info('this_computer.sync_set', { folders: bodies.length, enabled: bodies[0]?.enabled });
}

export function keepsLineOf(device: Device | null, folders: number): string {
  return joinParts([
    device?.label ?? null,
    device === null ? null : osLineOf(device),
    folders === 0 ? null : `keeps ${plural(folders, 'folder')} here`,
  ]);
}

const SYNC_MOUNT_HREF = href.settings.focus(
  DRIVE_SETTINGS_PAGE,
  driveSettingsSection('sync-mount').settingId,
);

function StateDot({ tone }: { readonly tone: PlacementTone }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        tone === null ? 'bg-on-surface-faint' : STATUS_FILL[tone],
      )}
    />
  );
}

function Fact({
  label,
  first,
  children,
}: {
  readonly label: string;
  readonly first: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'min-h-row-h flex-row items-center gap-3 py-2',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <Text variant="footnote" tone="variant" numberOfLines={1} className="w-24 shrink-0">
        {label}
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

function FolderFact({
  folder,
  first,
}: {
  readonly folder: ThisComputerFolder;
  readonly first: boolean;
}): ReactNode {
  return (
    <Fact label={folder.name} first={first}>
      <StateDot tone={folder.tone} />
      <View
        accessible
        accessibilityLabel={`${folder.name}, ${folder.line}, kept at ${folder.path}`}
        className="min-w-0 flex-1"
      >
        <Text variant="footnote" numberOfLines={1} className="font-mono">
          {folder.path}
        </Text>
        <Text variant="footnote" tone={folder.tone ?? 'variant'} numberOfLines={1}>
          {folder.line}
        </Text>
      </View>
    </Fact>
  );
}

function MountFact({
  mount,
  first,
}: {
  readonly mount: SyncLine;
  readonly first: boolean;
}): ReactNode {
  return (
    <Fact label="Drive" first={first}>
      <StateDot tone={mount.tone} />
      <Text variant="callout" numberOfLines={2} className="tabular min-w-0 flex-1">
        {mount.text}
      </Text>
      <Button label="Mount settings" variant="text" href={href.drivePage('computers')} />
    </Fact>
  );
}

function Actions({ view }: { readonly view: ThisComputerView }): ReactNode {
  const mutation = useMutationState();
  const resume = view.paused;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Choose folders"
        icon="folderSync"
        variant="tonal"
        grow
        href={SYNC_MOUNT_HREF}
      />
      {view.synced.length === 0 ? null : (
        <Button
          label={resume ? 'Resume' : 'Pause'}
          spoken={resume ? 'Resume syncing on this computer' : 'Pause syncing on this computer'}
          icon={resume ? 'play' : 'pause'}
          variant="outlined"
          loading={mutation.busy}
          onPress={() => {
            mutation.run(() => sendPause(pauseBodiesOf(view.synced, resume)), {
              failure: resume ? 'Syncing did not resume' : 'Syncing was not paused',
              label: 'drive.this_computer.pause',
            });
          }}
        />
      )}
    </View>
  );
}

function ThisComputerBody({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  const view = thisComputerViewOf(
    deviceId,
    useRows('drive_placements'),
    useDriveRoots(),
    useDriveSyncClients(),
  );
  return (
    <Card title="This computer" icon="monitor">
      <View className="flex-row items-center gap-2">
        <StateDot tone={view.state.tone} />
        <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
          {joinParts([view.state.text, keepsLineOf(device, view.folders.length)])}
        </Text>
      </View>
      <View>
        {view.folders.map((folder, index) => (
          <FolderFact key={folder.key} folder={folder} first={index === 0} />
        ))}
        <MountFact mount={view.mount} first={view.folders.length === 0} />
      </View>
      <Actions view={view} />
    </Card>
  );
}

function useThisComputerId(bridge: DesktopBridge): string | null {
  const identity = useScreenQuery({
    queryKey: IDENTITY_KEY,
    retry: false,
    queryFn: async () => {
      if (bridge.computerIdentity === undefined) throw new ThisComputerIdentityError();
      return DESKTOP_COMPUTER_IDENTITY.parse(await bridge.computerIdentity());
    },
  });
  return identity.data?.device_id ?? null;
}

function OnDesktop({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const deviceId = useThisComputerId(bridge);
  return deviceId === null ? null : <ThisComputerBody deviceId={deviceId} />;
}

export function ThisComputerCard(): ReactNode {
  const bridge = desktopBridge();
  return bridge === null ? null : <OnDesktop bridge={bridge} />;
}

class ThisComputerIdentityError extends Error {
  override readonly name = 'ThisComputerIdentityError';
  constructor() {
    super('This computer’s identity is unavailable. Update or reconnect this desktop.');
  }
}
