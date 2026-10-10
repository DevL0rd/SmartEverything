import {
  CommandRefusedError,
  type RouterCommand,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import type { PluginContext, PluginStop } from '../contract';
import { ClientRegistry } from './client-registry';
import { RouterCollector } from './collector';
import { runRouterCommand } from './controls';
import { DeviceMirror } from '../device-mirror';
import { wirelessInterfaces } from './frame';
import { ROUTER_DRIVER_ID, ROUTER_EXTERNAL_ID, routerMirror } from './router-device';
import { routerSearchEntries, searchSignature } from './router-search';
import { importRouterMonitor, SSH_KEY_SECRET } from './router-monitor-import';
import type { RouterSettings } from './settings';
import { listSpeedTests, saveSpeedTest } from './speed-tests';
import { runSpeedTest, SpeedTestError } from './speed-test';
import { SshRouterShell } from './ssh-shell';
import { routerTools } from './tools';

export const SNAPSHOT_STREAM = 'router.snapshot';
export const SPEED_TEST_STREAM = 'router.speed_test';
const HOST_KEY_RECORD = 'host_key';

type Context = PluginContext<RouterSettings>;

export function startRouter(ctx: Context): PluginStop {
  const registry = new ClientRegistry(ctx.records('clients'), ctx.events.emit, ctx.log);
  const sync = new DeviceMirror(routerMirror(ctx.metrics));
  let searched: string | null = null;
  const collector = createCollector(ctx, (snapshot) => {
    const enriched = { ...snapshot, clients: registry.observe(snapshot.clients, new Date()) };
    ctx.data.publish(SNAPSHOT_STREAM, enriched);
    sync.update(enriched);
    const signature = searchSignature(enriched.clients);
    if (signature !== searched) {
      searched = signature;
      ctx.search.replace(routerSearchEntries(enriched.clients));
    }
  });
  const latest = (): RouterSnapshot => collector?.latest ?? notSetUp();
  const speedTests = new SpeedTestRunner(ctx);
  ctx.tools.register(
    routerTools({
      snapshot: latest,
      knownClients: () => registry.known(),
      assignClient: (mac, profileId) => registry.assign(mac, profileId),
      command: (command) => runCommand(ctx, collector, command),
      speedTest: () => speedTests.run(),
      speedTests: () => listSpeedTests(ctx.records('speed_tests')),
      setPaused: (paused) => ctx.configure({ settings: { paused } }),
      importRouterMonitor: async () => {
        await ctx.configure(await importRouterMonitor());
      },
    }),
  );
  if (collector === null) {
    ctx.data.publish(SNAPSHOT_STREAM, notSetUp());
    return () => Promise.resolve();
  }
  return startMonitoring(ctx, collector, sync);
}

function startMonitoring(
  ctx: Context,
  collector: RouterCollector,
  sync: DeviceMirror<RouterSnapshot>,
): PluginStop {
  const unregister = ctx.devices.register({
    id: ROUTER_DRIVER_ID,
    start: ({ sink }) => {
      sync.attach(sink);
      return Promise.resolve(() => {
        sync.detach();
        return Promise.resolve();
      });
    },
    execute: (command) =>
      Promise.reject(
        new CommandRefusedError(command.capability, 'the router page has its own controls'),
      ),
  });
  const unwatch = ctx.settings.paused
    ? null
    : ctx.viewers.watchDevice(ROUTER_EXTERNAL_ID, (viewed) => {
        collector.setCadence(viewed ? 'fast' : 'slow');
      });
  collector.setCadence(ctx.settings.paused ? 'paused' : 'slow');
  return () => {
    unwatch?.();
    unregister();
    collector.stop();
    return Promise.resolve();
  };
}

function createCollector(
  ctx: Context,
  publish: (snapshot: RouterSnapshot) => void,
): RouterCollector | null {
  const host = ctx.settings.host;
  const privateKey = ctx.secrets.get(SSH_KEY_SECRET);
  if (host === null || privateKey === null) {
    return null;
  }
  const hostKeys = ctx.records('host');
  const pinned = hostKeys.get(HOST_KEY_RECORD);
  const shell = new SshRouterShell({
    host,
    user: ctx.settings.user,
    privateKey,
    hostKeySha256: typeof pinned === 'string' ? pinned : null,
    remoteScript: ctx.settings.remote_script,
    onFirstHostKey: (fingerprint): void => {
      hostKeys.put(HOST_KEY_RECORD, fingerprint);
      ctx.log.info('router.host_key_saved', { fingerprint });
    },
  });
  return new RouterCollector({
    shell,
    pingTarget: ctx.settings.ping_target,
    log: ctx.log,
    publish,
  });
}

async function runCommand(
  ctx: Context,
  collector: RouterCollector | null,
  command: RouterCommand,
): Promise<string> {
  if (collector === null) {
    throw new Error('The router is not set up yet');
  }
  const done = await runRouterCommand(
    {
      shell: collector.shell,
      wirelessInterfaces: wirelessInterfaces(collector.frame),
    },
    command,
  );
  ctx.log.info('router.command_done', { command: command.command });
  collector.refreshSoon();
  return done;
}

class SpeedTestRunner {
  #running: Promise<SpeedTestResult> | null = null;

  constructor(private readonly ctx: Context) {}

  run(): Promise<SpeedTestResult> {
    this.#running ??= this.#measure().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #measure(): Promise<SpeedTestResult> {
    const publish = this.ctx.data.publish;
    try {
      const result = await runSpeedTest((progress) => {
        publish(SPEED_TEST_STREAM, progress);
      }, this.ctx.signal);
      saveSpeedTest(this.ctx.records('speed_tests'), result);
      publish(SPEED_TEST_STREAM, {
        phase: 'done',
        mbps: result.downloadMbps,
        pingMs: result.pingMs,
        downloadMbps: result.downloadMbps,
        reason: null,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      publish(SPEED_TEST_STREAM, {
        phase: 'failed',
        mbps: 0,
        pingMs: null,
        downloadMbps: null,
        reason,
      });
      this.ctx.log.warn('router.speed_test_failed', { reason });
      throw error instanceof SpeedTestError ? error : new SpeedTestError(reason);
    }
  }
}

function notSetUp(): RouterSnapshot {
  return {
    at: new Date().toISOString(),
    connection: { state: 'not_set_up' },
    cadence: 'paused',
    intervalSeconds: null,
    info: null,
    system: null,
    network: null,
    radios: [],
    stations: [],
    clients: [],
  };
}
