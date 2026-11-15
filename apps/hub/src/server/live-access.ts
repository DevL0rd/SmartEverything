import {
  TABLE_AREAS,
  areaInScope,
  type ClientRow,
  type DriveAlbum,
  type DriveChangedNotice,
  type DriveCommentsChangedNotice,
  type DriveGrant,
  type DriveNotificationNotice,
  type DrivePlacement,
  type DriveProgressNotice,
  type DriveRoot,
  type LiveChange,
  type LiveMessage,
  type LiveTable,
  type TalkFloorsNotice,
} from '@smarteverything/domain';
import {
  albumVisibleTo,
  canRead,
  driveAccess,
  itemAccess,
  rootVisible,
  type DriveActor,
} from '../drive/access';
import { requestSeenBy } from '../store/repositories/drive-access-requests';
import type { Store } from '../store/store';
import { channelHidden, deviceIdReachable, presenceInScope, scopesOfClient } from './person-scope';

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
  'driveRoots' | 'driveAlbums' | 'driveItems' | 'driveGrants' | 'profiles' | 'computerNodes'
>;

function actorOf(hearer: Pick<Hearer, 'client'>, store: DriveStore): DriveActor {
  return { profileId: store.profiles.activeOf(hearer.client.id).id };
}

function rootShown(hearer: Pick<Hearer, 'client'>, rootId: string, store: DriveStore): boolean {
  const root = store.driveRoots.find(rootId);
  return root !== undefined && driveAccess(actorOf(hearer, store), root) !== 'none';
}

function albumShown(hearer: Pick<Hearer, 'client'>, albumId: string, store: DriveStore): boolean {
  const album = store.driveAlbums.find(albumId);
  if (album === undefined) return false;
  const actor = actorOf(hearer, store);
  return (
    albumVisibleTo(actor, album) ||
    store.driveAlbums.contributions.memberRole(album.id, actor.profileId) !== null
  );
}

function itemShown(hearer: Pick<Hearer, 'client'>, itemId: string, store: DriveStore): boolean {
  const actor = actorOf(hearer, store);
  const item = store.driveItems.find(itemId, actor.profileId);
  const root = item === undefined ? undefined : store.driveRoots.find(item.rootId);
  return item !== undefined && root !== undefined && canRead(itemAccess(store, actor, root, item));
}

function changedSeenBy(
  hearer: Pick<Hearer, 'client'>,
  notice: DriveChangedNotice,
  store: DriveStore,
): DriveChangedNotice | null {
  const rootIds = notice.rootIds.filter((id) => rootShown(hearer, id, store));
  const folderIds = notice.folderIds.filter((id) => itemShown(hearer, id, store));
  const albumIds = notice.albumIds.filter((id) => albumShown(hearer, id, store));
  return rootIds.length + folderIds.length + albumIds.length === 0
    ? null
    : { ...notice, rootIds, folderIds, albumIds };
}

export type DriveNotice =
  DriveChangedNotice | DriveProgressNotice | DriveCommentsChangedNotice | DriveNotificationNotice;

export function driveNoticeSeenBy(
  hearer: Pick<Hearer, 'client'>,
  notice: DriveNotice,
  store: DriveStore,
): LiveMessage | null {
  switch (notice.type) {
    case 'drive_progress':
      return rootShown(hearer, notice.rootId, store) ? notice : null;
    case 'drive_comments_changed':
      return itemShown(hearer, notice.itemId, store) ? notice : null;
    case 'drive_notification':
      return actorOf(hearer, store).profileId === notice.profileId ? notice : null;
    case 'drive_changed':
      return changedSeenBy(hearer, notice, store);
  }
}

const DRIVE_TABLES: ReadonlySet<LiveTable> = new Set<LiveTable>([
  'drive_roots',
  'drive_albums',
  'drive_grants',
  'drive_placements',
  'drive_notifications',
  'drive_access_requests',
  'drive_file_requests',
  'drive_transfers',
  'drive_offline_items',
]);

export type DriveChange = Extract<
  LiveChange,
  {
    table:
      | 'drive_roots'
      | 'drive_albums'
      | 'drive_grants'
      | 'drive_placements'
      | 'drive_notifications'
      | 'drive_access_requests'
      | 'drive_file_requests'
      | 'drive_transfers'
      | 'drive_offline_items';
  }
>;

export function driveChange(change: LiveChange): change is DriveChange {
  return DRIVE_TABLES.has(change.table);
}

export type DriveRow = DriveRoot | DriveAlbum | DriveGrant | DrivePlacement;

type OwnChange = Extract<
  DriveChange,
  {
    table:
      | 'drive_notifications'
      | 'drive_access_requests'
      | 'drive_file_requests'
      | 'drive_transfers'
      | 'drive_offline_items';
  }
>;

function ownChangeVisible(profileId: string, change: OwnChange): boolean {
  switch (change.table) {
    case 'drive_notifications':
    case 'drive_offline_items':
      return [change.record, change.oldRecord].some((row) => row?.profileId === profileId);
    case 'drive_access_requests':
      return [change.record, change.oldRecord].some(
        (row) => row?.requesterProfileId === profileId || row?.ownerProfileId === profileId,
      );
    case 'drive_file_requests':
      return [change.record, change.oldRecord].some((row) => row?.createdBy === profileId);
    case 'drive_transfers':
      return [change.record, change.oldRecord].some(
        (row) => row?.fromProfileId === profileId || row?.toProfileId === profileId,
      );
  }
}

export interface DriveRowLookups {
  readonly profileOf: (clientId: string) => string;
  readonly personOfDevice: (deviceId: string) => string | null;
  readonly albumMember: (albumId: string, profileId: string) => boolean;
  readonly rootVisible: (root: DriveRoot, profileId: string) => boolean;
}

export function driveRowVisible(
  hearer: Pick<Hearer, 'client'>,
  row: DriveRow,
  lookups: DriveRowLookups,
): boolean {
  const actor: DriveActor = { profileId: lookups.profileOf(hearer.client.id) };
  if ('localPath' in row) {
    return lookups.personOfDevice(row.deviceId) === actor.profileId;
  }
  if ('grantedBy' in row) {
    return row.grantedBy === actor.profileId || row.profileId === actor.profileId;
  }
  if ('title' in row) {
    return albumVisibleTo(actor, row) || lookups.albumMember(row.id, actor.profileId);
  }
  return lookups.rootVisible(row, actor.profileId);
}

const OWN_TABLES: ReadonlySet<LiveTable> = new Set<LiveTable>([
  'drive_notifications',
  'drive_access_requests',
  'drive_file_requests',
  'drive_transfers',
  'drive_offline_items',
]);

function ownChange(change: DriveChange): change is OwnChange {
  return OWN_TABLES.has(change.table);
}

export function driveChangeVisible(
  hearer: Pick<Hearer, 'client'>,
  change: DriveChange,
  store: DriveStore,
): boolean {
  if (ownChange(change)) return ownChangeVisible(actorOf(hearer, store).profileId, change);
  const row = change.record ?? change.oldRecord;
  return (
    row !== null &&
    driveRowVisible(hearer, row, {
      profileOf: (id) => store.profiles.activeOf(id).id,
      personOfDevice: (deviceId) => store.computerNodes.personOf(deviceId),
      albumMember: (albumId, profileId) =>
        store.driveAlbums.contributions.memberRole(albumId, profileId) !== null,
      rootVisible: (root, profileId) => rootVisible(store, { profileId }, root),
    })
  );
}

type AccessRequestChange = Extract<LiveChange, { table: 'drive_access_requests' }>;

export function accessRequestSeenBy(
  hearer: Pick<Hearer, 'client'>,
  change: AccessRequestChange,
  store: DriveStore,
): AccessRequestChange {
  const viewer = actorOf(hearer, store).profileId;
  return {
    ...change,
    record: change.record === null ? null : requestSeenBy(change.record, viewer),
    oldRecord: change.oldRecord === null ? null : requestSeenBy(change.oldRecord, viewer),
  };
}
