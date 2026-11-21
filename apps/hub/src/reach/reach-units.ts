import {
  CLIENT_PREFS,
  ApiError,
  type AiOutreachRow,
  type ClientRow,
  type ReachPresence,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';

export interface PresenceDevice {
  readonly id: string;
  readonly name: string;
  readonly room: string | null;
}

export interface PresenceRows {
  readonly name: string;
  readonly clients: readonly ClientRow[];
  readonly devices: readonly PresenceDevice[];
  readonly channels: ReachPresence['channels'];
  readonly open: readonly AiOutreachRow[];
}

export interface AppTarget {
  readonly client: ClientRow;
  readonly owner: string;
}

function clientsOf(store: HostStore, personId: string): ClientRow[] {
  return store.clients
    .list()
    .filter((client) => store.profiles.activeOf(client.id).id === personId);
}

function channelsOf(store: HostStore, clientIds: ReadonlySet<string>): ReachPresence['channels'] {
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

export const REACH_CLIENTS_UNIT = storeUnit((store, personId: string): ClientRow[] =>
  clientsOf(store, personId),
);

export const REACH_PRESENCE_UNIT = storeUnit(
  (
    store,
    { personId, devices }: { readonly personId: string; readonly devices: readonly string[] },
  ): PresenceRows => {
    const clients = clientsOf(store, personId);
    return {
      name: store.profiles.byId(personId).name,
      clients,
      devices: [...new Set(devices)].flatMap((id) => {
        const device = store.devices.find(id);
        if (device === undefined) return [];
        const room = device.room_id === null ? null : store.rooms.byId(device.room_id).name;
        return [{ id, name: device.display_name ?? device.name, room }];
      }),
      channels: channelsOf(store, new Set(clients.map((client) => client.id))),
      open: store.aiOutreach.open().filter((row) => row.profile_id === personId),
    };
  },
);

export const REACH_DEVICE_TARGET_UNIT = storeUnit((store, clientId: string): AppTarget | null => {
  const client = store.clients.find(clientId);
  return client === undefined ? null : { client, owner: store.profiles.activeOf(client.id).id };
});

export const REACH_CHANNEL_MEMBER_UNIT = storeUnit(
  (store, { profileId, channelId }: { readonly profileId: string; readonly channelId: string }) => {
    const mine = new Set(clientsOf(store, profileId).map((client) => client.id));
    return store.talk
      .members()
      .some((row) => row.channel_id === channelId && mine.has(row.member_id));
  },
);

export const REACH_SPEECH_TEXT_UNIT = storeUnit((store, clientId: string): boolean => {
  const owner = { clientId, profileId: store.profiles.activeOf(clientId).id };
  const read = store.personal.pref(CLIENT_PREFS.ai_speech, owner);
  if (read.status === 'invalid') {
    throw new ApiError('conflict', read.reason);
  }
  return read.value.showText;
});

export const REACH_PUSH_TARGETS_UNIT = storeUnit((store, _input: null): string[] =>
  store.personal.pushTargets().map((target) => target.client_id),
);

export const RETIRE_OUTREACH_UNIT = storeUnit((store, detail: string): void => {
  for (const row of store.aiOutreach.open()) {
    store.aiOutreach.step(row.id, { state: 'failed', detail });
  }
});
