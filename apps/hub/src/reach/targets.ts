import {
  isCamera,
  type ClientRow,
  type DeviceRow,
  type ReachTarget,
  type TalkChannelRow,
} from '@smarteverything/domain';
import type { PluginSpeaker, PluginSpeakers } from '../plugins/plugin-speakers';
import { clientsOf, deviceName, type PresenceStore } from './presence';
import { ReachRefusedError } from './reach-errors';
import type { Asker } from './reach-guards';
import type { ReachRules } from './reach-rules';

export type ResolvedTarget =
  | { readonly kind: 'camera'; readonly device: DeviceRow; readonly label: string }
  | {
      readonly kind: 'plugin';
      readonly device: DeviceRow;
      readonly speaker: PluginSpeaker;
      readonly label: string;
    }
  | { readonly kind: 'channel'; readonly channel: TalkChannelRow; readonly label: string }
  | { readonly kind: 'app'; readonly client: ClientRow; readonly label: string };

export type TargetStore = PresenceStore;

export interface TargetRules {
  readonly rules: ReachRules;
  readonly speakers: Pick<PluginSpeakers, 'forDevice'>;
}

function deviceTarget(store: TargetStore, access: TargetRules, deviceId: string): ResolvedTarget {
  const device = store.devices.find(deviceId);
  if (device !== undefined) {
    const label = deviceName(device);
    if (isCamera(device) && !access.rules.cameras().includes(device.id)) {
      throw new ReachRefusedError(
        `The AI may not talk through ${label}; it is turned off in Settings › Assistant › Reaching you.`,
      );
    }
    const speaker = access.speakers.forDevice(device);
    if (speaker !== null) {
      return { kind: 'plugin', device, speaker, label };
    }
    if (!isCamera(device)) {
      throw new ReachRefusedError(`${label} has no speaker the AI can use.`);
    }
    return { kind: 'camera', device, label };
  }
  const client = store.clients.list().find((candidate) => candidate.id === deviceId);
  if (client === undefined) {
    throw new ReachRefusedError(
      'No camera or app has that id; take it from presence_read or device_find.',
    );
  }
  return { kind: 'app', client, label: client.name };
}

function mayUseChannel(store: TargetStore, asker: Asker, channelId: string): void {
  if (asker.role === 'owner') {
    return;
  }
  const mine = new Set(clientsOf(store, asker.profileId).map((client) => client.id));
  const member = store.talk
    .members()
    .some((row) => row.channel_id === channelId && mine.has(row.member_id));
  if (!member) {
    throw new ReachRefusedError('Your AI can only talk on channels you are in.');
  }
}

export function resolveTarget(
  store: TargetStore,
  access: TargetRules,
  asker: Asker,
  target: ReachTarget,
): ResolvedTarget {
  if (target.kind === 'device') {
    return deviceTarget(store, access, target.deviceId);
  }
  const channel = store.talk.channels().find((row) => row.id === target.channelId);
  if (channel === undefined) {
    throw new ReachRefusedError('There is no walkie-talkie channel with that id.');
  }
  mayUseChannel(store, asker, channel.id);
  return { kind: 'channel', channel, label: channel.name };
}

export function appOwner(store: TargetStore, client: ClientRow): string {
  return store.profiles.activeOf(client.id).id;
}
