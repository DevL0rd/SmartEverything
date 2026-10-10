import {
  CommandRefusedError,
  type AdGuardConnection,
  type AdGuardSnapshot,
  type AdGuardStatus,
} from '@smarteverything/domain';
import type { PluginContext, PluginStop } from '../contract';
import { DeviceMirror } from '../device-mirror';
import { AdGuardClient } from './adguard-client';
import { ADGUARD_DRIVER_ID, ADGUARD_EXTERNAL_ID, ADGUARD_MIRROR } from './adguard-device';
import { adguardSearchEntries, adguardSearchSignature } from './adguard-search';
import { changeProtection } from './controls';
import { AdGuardMonitor } from './monitor';
import { importAdGuardFromRouterMonitor } from './router-monitor-import';
import { PASSWORD_SECRET, type AdGuardSettings } from './settings';
import { adguardTools } from './tools';

export const SNAPSHOT_STREAM = 'adguard.snapshot';
export const PROTECTION_CHANGED_EVENT = 'protection_changed';

type Context = PluginContext<AdGuardSettings>;

export function startAdGuard(ctx: Context): PluginStop {
  const { url, user } = ctx.settings;
  const password = ctx.secrets.get(PASSWORD_SECRET);
  if (url === null || user === null || password === null) {
    const idle = idleSnapshot(url, url === null ? 'not_set_up' : 'sign_in_needed');
    ctx.tools.register(
      adguardTools({
        snapshot: () => idle,
        client: () => {
          throw new Error('AdGuard Home is not set up yet');
        },
        changed: () => undefined,
        importRouterMonitor: importer(ctx),
      }),
    );
    ctx.data.publish(SNAPSHOT_STREAM, idle);
    ctx.search.replace(adguardSearchEntries([]));
    return () => Promise.resolve();
  }
  return startMonitor(ctx, url, new AdGuardClient(url, { user, password }));
}

function createMonitor(
  ctx: Context,
  url: string,
  client: AdGuardClient,
  mirror: DeviceMirror<AdGuardSnapshot>,
): AdGuardMonitor {
  let searched: string | null = null;
  return new AdGuardMonitor({
    client,
    url,
    log: ctx.log,
    publish: (snapshot): void => {
      ctx.data.publish(SNAPSHOT_STREAM, snapshot);
      mirror.update(snapshot);
      const signature = adguardSearchSignature(snapshot.filters);
      if (signature !== searched) {
        searched = signature;
        ctx.search.replace(adguardSearchEntries(snapshot.filters));
      }
    },
    protectionChanged: (status): void => {
      ctx.events.emit(protectionEvent(status));
    },
  });
}

function protectionEvent(status: AdGuardStatus): {
  kind: string;
  subject: string;
  data: { enabled: boolean; until: string | null };
} {
  return {
    kind: PROTECTION_CHANGED_EVENT,
    subject: status.protection ? 'Ad blocking turned on' : 'Ad blocking turned off',
    data: { enabled: status.protection, until: status.pausedUntil },
  };
}

function registerDevice(
  ctx: Context,
  mirror: DeviceMirror<AdGuardSnapshot>,
  monitor: AdGuardMonitor,
): () => void {
  return ctx.devices.register({
    id: ADGUARD_DRIVER_ID,
    start: ({ sink }) => {
      mirror.attach(sink);
      return Promise.resolve(() => {
        mirror.detach();
        return Promise.resolve();
      });
    },
    execute: async (request) => {
      if (request.capability !== 'dns_protection' || typeof request.value !== 'boolean') {
        throw new CommandRefusedError(request.capability, 'AdGuard Home only switches ad blocking');
      }
      const done = await changeProtection(
        monitor.client,
        request.value ? { enabled: true } : { enabled: false, minutes: null },
      );
      monitor.refresh();
      return { done };
    },
  });
}

function startMonitor(ctx: Context, url: string, client: AdGuardClient): PluginStop {
  const mirror = new DeviceMirror(ADGUARD_MIRROR);
  const monitor = createMonitor(ctx, url, client, mirror);
  ctx.tools.register(
    adguardTools({
      snapshot: () => monitor.latest,
      client: () => client,
      changed: () => {
        ctx.log.info('adguard.change_done', {});
        monitor.refresh();
      },
      importRouterMonitor: importer(ctx),
    }),
  );
  const unregister = registerDevice(ctx, mirror, monitor);
  const unwatch = ctx.settings.paused
    ? null
    : ctx.viewers.watchDevice(ADGUARD_EXTERNAL_ID, (viewed) => {
        monitor.setCadence(viewed ? 'fast' : 'slow');
      });
  monitor.setCadence(ctx.settings.paused ? 'paused' : 'slow');
  return () => {
    unwatch?.();
    unregister();
    monitor.stop();
    return Promise.resolve();
  };
}

function idleSnapshot(
  url: string | null,
  state: Extract<AdGuardConnection['state'], 'not_set_up' | 'sign_in_needed'>,
): AdGuardSnapshot {
  return {
    at: new Date().toISOString(),
    url,
    connection: { state },
    cadence: 'paused',
    intervalSeconds: null,
    status: null,
    stats: null,
    filters: [],
    userRules: [],
  };
}

function importer(ctx: Context): () => Promise<void> {
  return async () => {
    await ctx.configure(await importAdGuardFromRouterMonitor());
  };
}
