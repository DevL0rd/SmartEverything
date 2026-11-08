import {
  TABLE_AREAS,
  areaInScope,
  type ClientRow,
  type DriveAlbum,
  type DrivePlacement,
  type DriveChangedNotice,
  type DriveProgressNotice,
  type DriveRoot,
  type DriveSyncClient,
  type LiveChange,
  type LiveMessage,
  type LiveTable,
  type TalkFloorsNotice,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { channelHidden, deviceIdReachable, presenceInScope, scopesOfClient } from './person-scope';
import { sceneDeviceIds } from './snapshot-reach';

export type ReachStore = Pick<
  Store,
  'devices' | 'personAccess' | 'profiles' | 'infrared' | 'localDevices'
>;

interface Hearer {
  readonly client: Pick<ClientRow, 'id' | 'role'>;
  readonly tables: ReadonlySet<LiveTable>;
}

const DEVICE_ROW_TABLES: ReadonlySet<LiveTable> = new Set([
  'device_state',
  'state_history',
  'commands',
  'events',
  'cameras',
  'recordings',
  'television_settings',
  'device_effect_targets',
]);

type DeviceRowChange = Extract<
  LiveChange,
  {
    table:
      | 'device_state'
      | 'state_history'
      | 'commands'
      | 'events'
      | 'cameras'
      | 'recordings'
      | 'television_settings'
      | 'device_effect_targets';
  }
>;

function deviceRowChange(change: LiveChange): change is DeviceRowChange {
  return DEVICE_ROW_TABLES.has(change.table);
}

function idsOf(id: string | null | undefined): string[] {
  return id === null || id === undefined ? [] : [id];
}

function rowDevices(change: LiveChange): readonly string[] | null {
  if (deviceRowChange(change)) return idsOf((change.record ?? change.oldRecord)?.device_id);
  if (change.table === 'devices') return idsOf((change.record ?? change.oldRecord)?.id);
  return null;
}

function remoteDevices(change: LiveChange, store: ReachStore): readonly string[] | null {
  if (change.table === 'ir_remotes') return idsOf((change.record ?? change.oldRecord)?.blaster_id);
  if (change.table !== 'ir_codes') return null;
  const remote = (change.record ?? change.oldRecord)?.remote_id;
  const blaster = store.infrared.remotes().find((candidate) => candidate.id === remote);
  return idsOf(blaster?.blaster_id);
}

function listedDevices(change: LiveChange): readonly string[] | null {
  if (change.table === 'device_groups')
    return (change.record ?? change.oldRecord)?.device_ids ?? [];
  if (change.table === 'scenes')
    return sceneDeviceIds((change.record ?? change.oldRecord)?.actions);
  return null;
}

function boundDevices(change: LiveChange, store: ReachStore): readonly string[] {
  return rowDevices(change) ?? remoteDevices(change, store) ?? listedDevices(change) ?? [];
}

function boundChannel(change: LiveChange): string | null {
  if (change.table === 'talk_channels') return (change.record ?? change.oldRecord)?.id ?? null;
  if (change.table === 'talk_members' || change.table === 'talk_messages') {
    return (change.record ?? change.oldRecord)?.channel_id ?? null;
  }
  return null;
}

export function hiddenByAccess(hearer: Hearer, change: LiveChange, store: ReachStore): boolean {
  const scopes = scopesOfClient(store, hearer.client);
  if (scopes === null) return false;
  const area = TABLE_AREAS[change.table];
  if (area !== undefined && !areaInScope(scopes, area)) return true;
  if (boundDevices(change, store).some((id) => !deviceIdReachable(store, scopes.devices, id))) {
    return true;
  }
  const channel = boundChannel(change);
  return channel !== null && channelHidden(scopes.channels, channel);
}

export function floorsSeenBy(
  hearer: Pick<Hearer, 'client'>,
  notice: TalkFloorsNotice,
  store: ReachStore,
): TalkFloorsNotice {
  const scopes = scopesOfClient(store, hearer.client);
  return scopes === null ? notice : { ...notice, ...presenceInScope(scopes.channels, notice) };
}

export type DriveStore = Pick<
  Store,
  'driveRoots' | 'driveAlbums' | 'driveItems' | 'profiles' | 'computerNodes'
>;

interface DriveScoped {
  readonly scope: 'home' | 'person';
  readonly ownerProfileId: string | null;
}

export function driveScopeVisible(
  role: ClientRow['role'],
  profileId: string,
  row: DriveScoped,
): boolean {
  return role === 'owner' || row.scope === 'home' || row.ownerProfileId === profileId;
}

function rootShown(hearer: Pick<Hearer, 'client'>, rootId: string, store: DriveStore): boolean {
  const root = store.driveRoots.find(rootId);
  return (
    root !== undefined &&
    driveScopeVisible(hearer.client.role, store.profiles.activeOf(hearer.client.id).id, root)
  );
}

function albumShown(hearer: Pick<Hearer, 'client'>, albumId: string, store: DriveStore): boolean {
  const album = store.driveAlbums.find(albumId);
  return (
    album !== undefined &&
    driveScopeVisible(hearer.client.role, store.profiles.activeOf(hearer.client.id).id, album)
  );
}

function folderShown(hearer: Pick<Hearer, 'client'>, folderId: string, store: DriveStore): boolean {
  const folder = store.driveItems.find(folderId);
  return folder !== undefined && rootShown(hearer, folder.rootId, store);
}

function changedSeenBy(
  hearer: Pick<Hearer, 'client'>,
  notice: DriveChangedNotice,
  store: DriveStore,
): DriveChangedNotice | null {
  const rootIds = notice.rootIds.filter((id) => rootShown(hearer, id, store));
  const folderIds = notice.folderIds.filter((id) => folderShown(hearer, id, store));
  const albumIds = notice.albumIds.filter((id) => albumShown(hearer, id, store));
  return rootIds.length + folderIds.length + albumIds.length === 0
    ? null
    : { ...notice, rootIds, folderIds, albumIds };
}

export function driveNoticeSeenBy(
  hearer: Pick<Hearer, 'client'>,
  notice: DriveChangedNotice | DriveProgressNotice,
  store: DriveStore,
): LiveMessage | null {
  if (hearer.client.role === 'owner') return notice;
  if (notice.type === 'drive_progress') {
    return rootShown(hearer, notice.rootId, store) ? notice : null;
  }
  return changedSeenBy(hearer, notice, store);
}

export type DriveChange = Extract<
  LiveChange,
  { table: 'drive_roots' | 'drive_albums' | 'drive_sync_clients' | 'drive_placements' }
>;

export function driveChange(change: LiveChange): change is DriveChange {
  return (
    change.table === 'drive_roots' ||
    change.table === 'drive_albums' ||
    change.table === 'drive_sync_clients' ||
    change.table === 'drive_placements'
  );
}

export type DriveRow = DriveRoot | DriveAlbum | DriveSyncClient | DrivePlacement;

export function driveRowVisible(
  hearer: Pick<Hearer, 'client'>,
  row: DriveRow,
  profileOf: (clientId: string) => string,
  personOfDevice: (deviceId: string) => string | null,
): boolean {
  const profileId = profileOf(hearer.client.id);
  if ('localPath' in row) {
    return hearer.client.role === 'owner' || personOfDevice(row.deviceId) === profileId;
  }
  if ('clientId' in row) return hearer.client.role === 'owner' || row.profileId === profileId;
  return driveScopeVisible(hearer.client.role, profileId, row);
}

export function driveChangeVisible(
  hearer: Pick<Hearer, 'client'>,
  change: DriveChange,
  store: DriveStore,
): boolean {
  const row = change.record ?? change.oldRecord;
  return (
    row !== null &&
    driveRowVisible(
      hearer,
      row,
      (id) => store.profiles.activeOf(id).id,
      (deviceId) => store.computerNodes.personOf(deviceId),
    )
  );
}
