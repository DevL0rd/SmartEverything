import {
  TABLE_AREAS,
  areaInScope,
  type ClientRow,
  type LiveChange,
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
