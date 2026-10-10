import type {
  ClientRow,
  DeviceRow,
  PhoneContext,
  ReachPresence,
  SignalInput,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ReachRules } from './reach-rules';

type Room = NonNullable<ReachPresence['lastActivityInHome']>;

const MINUTE_MS = 60_000;

export type PresenceStore = Pick<
  Store,
  'clients' | 'profiles' | 'devices' | 'rooms' | 'talk' | 'aiOutreach'
>;

export interface PresenceSources {
  readonly store: PresenceStore;
  readonly rules: ReachRules;
  readonly online: () => ReadonlySet<string>;
  readonly seen: () => readonly SignalInput[];
  readonly phone: (personId: string, viewerId: string) => PhoneContext;
  readonly now: () => Date;
}

export function deviceName(device: DeviceRow): string {
  return device.display_name ?? device.name;
}

function roomName(store: PresenceStore, device: DeviceRow): string | null {
  return device.room_id === null ? null : store.rooms.byId(device.room_id).name;
}

export function clientsOf(store: PresenceStore, personId: string): ClientRow[] {
  return store.clients
    .list()
    .filter((client) => store.profiles.activeOf(client.id).id === personId);
}

function lastActivity(sources: PresenceSources): Room | null {
  const { store } = sources;
  for (const signal of sources.seen()) {
    const device = signal.subject === null ? undefined : store.devices.find(signal.subject);
    if (device !== undefined && (signal.kind === 'person' || signal.kind === 'motion')) {
      return {
        deviceId: device.id,
        device: deviceName(device),
        room: roomName(store, device),
        seen: signal.kind,
        at: signal.at,
        minutesAgo: Math.max(
          0,
          Math.floor((sources.now().getTime() - Date.parse(signal.at)) / MINUTE_MS),
        ),
      };
    }
  }
  return null;
}

function channelsOf(
  store: PresenceStore,
  clientIds: ReadonlySet<string>,
): ReachPresence['channels'] {
  const joined = new Set(
    store.talk
      .members()
      .filter((member) => member.member_kind === 'client' && clientIds.has(member.member_id))
      .map((member) => member.channel_id),
  );
  return store.talk
    .channels()
    .filter((channel) => joined.has(channel.id))
    .map((channel) => ({ id: channel.id, name: channel.name }));
}

function camerasOf(sources: PresenceSources): ReachPresence['cameras'] {
  const { store } = sources;
  return sources.rules.cameras().flatMap((id) => {
    const device = store.devices.find(id);
    return device === undefined
      ? []
      : [{ id, name: deviceName(device), room: roomName(store, device) }];
  });
}

export function presenceOf(
  sources: PresenceSources,
  personId: string,
  viewerId: string,
): ReachPresence {
  const { store, rules } = sources;
  const online = sources.online();
  const clients = clientsOf(store, personId);
  const phone = sources.phone(personId, viewerId);
  return {
    personId,
    name: store.profiles.byId(personId).name,
    quietNow: rules.quietNow(personId),
    quiet: rules.quiet(personId),
    apps: clients.map((client) => ({
      clientId: client.id,
      name: client.name,
      platform: client.platform,
      connected: online.has(client.id),
      lastSeenAt: client.last_seen_at,
    })),
    phone: phone.deviceId === null ? null : phone,
    lastActivityInHome: lastActivity(sources),
    cameras: camerasOf(sources),
    channels: channelsOf(store, new Set(clients.map((client) => client.id))),
    open: store.aiOutreach.open().filter((row) => row.profile_id === personId),
  };
}
