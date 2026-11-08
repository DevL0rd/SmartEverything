import {
  SYNCTHING_SNAPSHOT,
  type JsonValue,
  type PluginOption,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import type { PluginContext, PluginOptionProvider, PluginStop } from '../contract';
import { DEVICE_INVITE_PREFIX, FOLDER_INVITE_PREFIX } from './automation-tools';
import { SNAPSHOT_STREAM } from './runtime';
import type { SyncthingSettings } from './settings';
import { optionPage } from '../automation-kit-pages';

type Context = PluginContext<SyncthingSettings>;

export const FOLDER_PICKER = 'folders';
export const PEER_PICKER = 'peers';
export const INVITE_PICKER = 'invites';

const TEXT_MAX = 200;
const SHORT_ID = 7;

function fit(text: string): string {
  return text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text;
}

function option(id: string, label: string, detail: string | null): PluginOption {
  return {
    id: fit(id),
    label: fit(label),
    detail: detail === null ? null : fit(detail),
    color: null,
    image: null,
  };
}

function namedOr(name: string, id: string): string {
  return name.trim().length > 0 ? name : id.slice(0, SHORT_ID);
}

export function folderOptions(snapshot: SyncthingSnapshot): readonly PluginOption[] {
  return snapshot.folders.map((folder) =>
    option(
      folder.id,
      folder.label.trim().length > 0 ? folder.label : folder.id,
      folder.paused ? 'Paused' : folder.path,
    ),
  );
}

export function peerOptions(snapshot: SyncthingSnapshot): readonly PluginOption[] {
  return snapshot.peers.map((peer) =>
    option(
      peer.id,
      namedOr(peer.name, peer.id),
      peer.paused ? 'Paused' : peer.connected ? 'Online' : 'Offline',
    ),
  );
}

export function inviteOptions(snapshot: SyncthingSnapshot): readonly PluginOption[] {
  return [
    ...snapshot.pendingDevices.map((device) =>
      option(
        `${DEVICE_INVITE_PREFIX}${device.id}`,
        namedOr(device.name, device.id),
        'Wants to connect',
      ),
    ),
    ...snapshot.pendingFolders.map((folder) =>
      option(
        `${FOLDER_INVITE_PREFIX}${folder.id}`,
        folder.label.trim().length > 0 ? folder.label : folder.id,
        `Offered by ${folder.offeredBy.map((by) => namedOr(by.name, by.id)).join(', ')}`,
      ),
    ),
  ];
}

function refusalOf(snapshot: SyncthingSnapshot | null): string | null {
  if (snapshot === null) return 'Syncthing has not reported yet.';
  const { connection } = snapshot;
  switch (connection.state) {
    case 'not_set_up':
      return 'Syncthing is not set up yet. Add its address and key in the plugin settings.';
    case 'key_rejected':
      return 'Syncthing refused the API key. Check it in the plugin settings.';
    case 'connecting':
      return snapshot.myId === null ? 'Syncthing is still connecting.' : null;
    case 'unreachable':
      return snapshot.myId === null ? `Syncthing cannot be reached: ${connection.reason}` : null;
    case 'online':
      return null;
  }
}

export function syncthingPicker(
  optionsOf: (snapshot: SyncthingSnapshot) => readonly PluginOption[],
  latest: () => SyncthingSnapshot | null,
): PluginOptionProvider {
  return (query) => {
    const snapshot = latest();
    const refusal = refusalOf(snapshot);
    if (snapshot === null || refusal !== null) {
      return Promise.resolve({
        state: 'unavailable',
        message: refusal ?? 'Syncthing has not reported yet.',
      });
    }
    return Promise.resolve(optionPage(optionsOf(snapshot), query));
  };
}

const PICKERS = [
  [FOLDER_PICKER, folderOptions],
  [PEER_PICKER, peerOptions],
  [INVITE_PICKER, inviteOptions],
] as const;

type Observed = Pick<Context, 'options' | 'data' | 'log'>;

export function startWithPickers<C extends Observed>(
  ctx: C,
  start: (ctx: C) => PluginStop,
): Promise<PluginStop> {
  let latest: SyncthingSnapshot | null = null;
  const unregister = PICKERS.map(([source, optionsOf]) =>
    ctx.options.register(
      source,
      syncthingPicker(optionsOf, () => latest),
    ),
  );
  const observed: C = {
    ...ctx,
    data: {
      publish: (stream: string, value: JsonValue): void => {
        if (stream === SNAPSHOT_STREAM) latest = snapshotOf(ctx, value, latest);
        ctx.data.publish(stream, value);
      },
    },
  };
  const release = (): void => {
    unregister.forEach((unregisterOne) => {
      unregisterOne();
    });
  };
  try {
    const stop = start(observed);
    return Promise.resolve(async () => {
      release();
      await stop();
    });
  } catch (cause) {
    release();
    throw cause;
  }
}

function snapshotOf(
  ctx: Observed,
  value: JsonValue,
  previous: SyncthingSnapshot | null,
): SyncthingSnapshot | null {
  const parsed = SYNCTHING_SNAPSHOT.safeParse(value);
  if (parsed.success) return parsed.data;
  ctx.log.error('syncthing.picker_snapshot_invalid', parsed.error);
  return previous;
}
