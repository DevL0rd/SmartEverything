import {
  CommandRefusedError,
  type SyncthingCommand,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import type { PluginContext, PluginStop } from '../contract';
import { importLocalSyncthing } from './config-import';
import { runSyncthingCommand } from './controls';
import { SyncthingRest } from './rest-client';
import { API_KEY_SECRET, type SyncthingSettings } from './settings';
import { DeviceMirror } from '../device-mirror';
import { SYNCTHING_DRIVER_ID, SYNCTHING_EXTERNAL_ID, SYNCTHING_MIRROR } from './sync-device';
import { SyncthingMonitor } from './sync-monitor';
import { syncthingSearchEntries, syncthingSearchSignature } from './sync-search';
import { syncthingTools } from './tools';

export const SNAPSHOT_STREAM = 'syncthing.snapshot';
export const ACTIVITY_STREAM = 'syncthing.activity';

type Context = PluginContext<SyncthingSettings>;

export function startSyncthing(ctx: Context): PluginStop {
  const url = ctx.settings.url;
  const apiKey = ctx.secrets.get(API_KEY_SECRET);
  const importLocal = async (): Promise<void> => {
    await ctx.configure(await importLocalSyncthing());
  };
  if (url === null || apiKey === null) {
    const idle = notSetUp();
    ctx.tools.register(
      syncthingTools({
        snapshot: () => idle,
        activity: () => [],
        command: () => Promise.reject(new Error('Syncthing is not set up yet')),
        importLocal,
      }),
    );
    ctx.data.publish(SNAPSHOT_STREAM, idle);
    return () => Promise.resolve();
  }
  return startMonitor(ctx, new SyncthingRest(url, apiKey), importLocal);
}

function createMonitor(
  ctx: Context,
  rest: SyncthingRest,
  sync: DeviceMirror<SyncthingSnapshot>,
): SyncthingMonitor {
  let searched: string | null = null;
  return new SyncthingMonitor({
    rest,
    overdueHours: ctx.settings.overdue_hours,
    log: ctx.log,
    publish: (snapshot): void => {
      ctx.data.publish(SNAPSHOT_STREAM, snapshot);
      sync.update(snapshot);
      const signature = syncthingSearchSignature(snapshot);
      if (signature !== searched) {
        searched = signature;
        ctx.search.replace(syncthingSearchEntries(snapshot));
      }
    },
    publishActivity: (activity): void => {
      ctx.data.publish(
        ACTIVITY_STREAM,
        activity.map((entry) => ({ ...entry })),
      );
    },
    emit: ctx.events.emit,
  });
}

function registerDevice(
  ctx: Context,
  sync: DeviceMirror<SyncthingSnapshot>,
  command: (value: SyncthingCommand) => Promise<string>,
): () => void {
  return ctx.devices.register({
    id: SYNCTHING_DRIVER_ID,
    start: ({ sink }) => {
      sync.attach(sink);
      return Promise.resolve(() => {
        sync.detach();
        return Promise.resolve();
      });
    },
    execute: async (request) => {
      if (request.capability !== 'sync_paused' || typeof request.value !== 'boolean') {
        throw new CommandRefusedError(request.capability, 'Syncthing only pauses or resumes here');
      }
      return {
        done: await command({
          command: 'set_paused',
          target: { kind: 'all' },
          paused: request.value,
        }),
      };
    },
  });
}

function startMonitor(
  ctx: Context,
  rest: SyncthingRest,
  importLocal: () => Promise<void>,
): PluginStop {
  const sync = new DeviceMirror(SYNCTHING_MIRROR);
  const monitor = createMonitor(ctx, rest, sync);
  const command = async (value: SyncthingCommand): Promise<string> => {
    const done = await runSyncthingCommand(rest, value);
    ctx.log.info('syncthing.command_done', { command: value.command });
    monitor.refreshSoon();
    return done;
  };
  ctx.tools.register(
    syncthingTools({
      snapshot: () => monitor.latest,
      activity: () => monitor.activity,
      command,
      importLocal,
    }),
  );
  const unregister = registerDevice(ctx, sync, command);
  const unwatch = ctx.viewers.watchDevice(SYNCTHING_EXTERNAL_ID, (viewed) => {
    monitor.setWatched(viewed);
  });
  monitor.start();
  return () => {
    unwatch();
    unregister();
    monitor.stop();
    return Promise.resolve();
  };
}

function notSetUp(): SyncthingSnapshot {
  return {
    at: new Date().toISOString(),
    connection: { state: 'not_set_up' },
    version: null,
    myId: null,
    uptimeSeconds: null,
    ratesLive: false,
    summary: {
      state: 'offline',
      needBytes: 0,
      foldersBehind: 0,
      peersOnline: 0,
      peersTotal: 0,
      downloadBytesPerSecond: 0,
      uploadBytesPerSecond: 0,
    },
    folders: [],
    peers: [],
    pendingDevices: [],
    pendingFolders: [],
    attention: [],
  };
}
