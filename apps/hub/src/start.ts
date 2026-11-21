import { connectionPortNeeds } from './network/firewall';
import { HubConnections } from './network/connections';
import { openHubIdentity } from './network/identity';
import { advertiseHub } from './network/mdns-advertise';
import type { OpenMdns } from './network/mdns';
import type { InterfaceSnapshot } from './network/lan';
import type { Server } from 'node:http';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import type { HubStatus, PublicStatus } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import { rearmTimers, systemClock, type Clock } from './clock';
import type { HubLayout } from './data-layout';
import { lockDataDirectory, type DataLock } from './data-lock';
import type { RunningExtension, ServerExtension } from './extensions';
import { bodyAlertsExtension } from './extensions/body-alerts';
import { computersExtension } from './computers/extension';
import { appUpdatesExtension } from './app-updates/extension';
import { hubUpdateCompletionExtension } from './self-update/completion-extension';
import { updatePipelineExtension } from './self-update/pipeline-extension';
import { hubUpdateSourceWiring } from './self-update/source-wiring';
import type { HubUpdateSourceRoutes } from './server/handlers/hub-update-source';
import { machineUpdatesExtension } from './updates/extension';
import { releaseUploadsExtension } from './releases/upload-routes';
import { phonesExtension } from './phones/extension';
import { treadmillsExtension } from './local/treadmill/extension';
import { recordingRetentionExtension } from './cameras/recording-retention-extension';
import { stopGo2rtcForShutdown } from './cameras/go2rtc-shutdown';
import { toothbrushesExtension } from './local/toothbrush/extension';
import { bottlesExtension } from './local/bottle/extension';
import { mcpExtension } from './extensions/mcp';
import { DeviceNotices } from './extensions/device-notices';
import { OwnerAlerts } from './extensions/owner-alerts';
import { laundryNoticesExtension } from './laundry/notices-extension';
import { privacyExtension } from './extensions/privacy';
import { nodeFirewallSystem, type FirewallSystem } from './firewall/system';
import { pushExtension } from './extensions/push';
import { smartThingsWiring } from './extensions/smartthings';
import type { ModuleRegistry } from './providers/registry-types';
import { watchResume } from './clock/resume-watch';
import { openSecretStore } from './secrets/open';
import { buildServer, type BuiltServer } from './server/build';
import { originAllowList } from './server/origin-allow-list';
import { serviceUrl } from './service/configuration';
import { listenWhileStarting } from './service/starting-listener';
import type { LogLines } from './service/log-lines';
import { startCore, type Core } from './services';
import { openStore, type Store } from './store/store';
import { LogStore } from './logs/log-store';
import { closeCodecs, openCodecs, type Codecs } from './codec/open';
import { HUB_VERSION } from './version';
import { storeReaders } from './store/host/script';

export const DEFAULT_ORIGINS: readonly string[] = ['app://smarteverything'];

export interface ServerOptions {
  readonly lan?: { readonly port: number; readonly host?: string; readonly advertise?: boolean };
  readonly interfaces?: InterfaceSnapshot;
  readonly layout: HubLayout;
  readonly hubBootRunId?: string;
  readonly codex?: {
    readonly executable?: string;
    readonly controlSocket?: string;
  };
  readonly port: number;
  readonly host?: string;
  readonly go2rtcBinary: string;
  readonly go2rtcApiPort?: number;
  readonly go2rtcRtspPort?: number;
  readonly webrtcPort?: number;
  readonly log: Logger;
  readonly logLines: LogLines;
  readonly logWorkerScript: string;
  readonly codecWorkerScript: string;
  readonly storeHostScript: string;
  readonly fatal: (cause: Error) => void;
  readonly modules?: ModuleRegistry;
  readonly allowedOrigins?: readonly string[];
  readonly developmentOrigins?: boolean;
  readonly extensions?: readonly ServerExtension[];
  readonly clock?: Clock;
  readonly fetch?: typeof fetch;
  readonly firewall?: FirewallSystem;
  readonly mdns?: OpenMdns;
}

export interface RunningServer {
  readonly ownerToken: string;
  readonly url: string;
  readonly rotateOwnerToken: () => Promise<string>;
  readonly status: () => HubStatus;
  readonly publicStatus: () => Promise<PublicStatus>;
  readonly stop: () => Promise<void>;
}

interface Started extends Codecs {
  readonly lock: DataLock;
  readonly store: Store;
  readonly logs: LogStore;
  readonly core: Core;
  readonly built: BuiltServer;
  readonly extensions: readonly RunningExtension[];
}

function serverExtensions(
  options: ServerOptions,
  clock: Clock,
  alerts: OwnerAlerts,
  smartthings: ReturnType<typeof smartThingsWiring>,
): readonly ServerExtension[] {
  const notices = new DeviceNotices();
  return [
    mcpExtension({ clock, alerts }),
    pushExtension({ fetch: options.fetch ?? fetch, now: clock.now, alerts, notices }),
    laundryNoticesExtension({ notices, clock }),
    smartthings.extension,
    privacyExtension(),
    bodyAlertsExtension({ alerts }),
    computersExtension(clock.now),
    phonesExtension(clock.now),
    treadmillsExtension(clock.now),
    bottlesExtension(clock.now),
    toothbrushesExtension(clock),
    machineUpdatesExtension(),
    releaseUploadsExtension(clock.now),
    appUpdatesExtension(),
    hubUpdateCompletionExtension(),
    updatePipelineExtension(),
    recordingRetentionExtension(clock),
    ...(options.extensions ?? []),
  ];
}

function allowedOriginsOf(options: ServerOptions): ReadonlySet<string> {
  return originAllowList(
    options.allowedOrigins ?? DEFAULT_ORIGINS,
    options.developmentOrigins ?? false,
  );
}

function listen(server: Server, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(
          new Error(`The server is not listening on a TCP port; it reported ${String(address)}.`),
        );
        return;
      }
      resolve(address);
    });
  });
}

async function stopAll(
  started: Started,
  withdraw: () => Promise<void>,
  go2rtcLog: Logger,
): Promise<void> {
  await withdraw();
  await started.built.stop();
  await closeListeners(started.built);
  await Promise.all(started.extensions.map((extension) => extension.stop()));
  await started.core.hub.stop();
  started.core.firewall.stop();
  started.core.cameraHealth.stop();
  await stopGo2rtcForShutdown(started.core.supervisor, go2rtcLog);
  await closeCodecs(started);
  await started.logs.close();
  started.store.close();
  await started.lock.release();
}

type Undo = () => Promise<void> | void;

async function rollBack(undo: readonly Undo[], log: Logger): Promise<void> {
  for (const step of [...undo].reverse()) {
    try {
      await step();
    } catch (cause) {
      log.error('server.rollback_failed', cause);
    }
  }
}

function coreOptions(
  options: ServerOptions,
  clock: Clock,
  smartthings: ProviderModule<'smartthings'>,
): Parameters<typeof startCore>[0] {
  return {
    layout: options.layout,
    cameras: {
      binary: options.go2rtcBinary,
      apiPort: options.go2rtcApiPort ?? 1984,
      rtspPort: options.go2rtcRtspPort ?? 8554,
      webrtcPort: options.webrtcPort ?? 8555,
    },
    smartthings,
    modules: options.modules === undefined ? null : { smartthings, ...options.modules },
    firewall: options.firewall ?? nodeFirewallSystem(options.go2rtcBinary),
    clock,
    fetch: options.fetch ?? fetch,
    log: options.log,
    codecWorkerScript: options.codecWorkerScript,
    fatal: options.fatal,
  };
}

async function openConnections(options: ServerOptions, store: Store): Promise<HubConnections> {
  return new HubConnections(
    await openHubIdentity(options.layout.system.keys.tlsIdentity),
    store,
    options.interfaces,
  );
}

function openHubStore(options: ServerOptions, clock: Clock): Store {
  const { layout } = options;
  return openStore({
    path: layout.system.database.file,
    log: options.log,
    now: clock.now,
    systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    driveFolders: layout.drives,
    host: { script: options.storeHostScript, readers: storeReaders() },
  });
}

function openHubLogs(options: ServerOptions, store: Store): LogStore {
  return LogStore.open({
    path: options.layout.system.logs.runtimeLogs,
    workerScript: options.logWorkerScript,
    repairs: store.aiRepairInbox,
    now: store.now,
    log: options.log.forArea('hub.logs'),
    fatal: options.fatal,
  });
}

async function boot(
  options: ServerOptions,
  clock: Clock,
  undo: Undo[],
  hubUpdateSourceRoutes: HubUpdateSourceRoutes,
): Promise<Started> {
  const lock = await lockDataDirectory(options.layout);
  undo.push(lock.release);
  const secrets = await openSecretStore(options.layout.system.keys, options.log);
  const store = openHubStore(options, clock);
  undo.push(store.close);
  const logs = openHubLogs(options, store);
  undo.push(() => logs.close());
  const codecs = openCodecs(options.codecWorkerScript, options.log);
  undo.push(() => closeCodecs(codecs));
  const outbound = options.fetch ?? fetch;
  const smartthings = smartThingsWiring({ secrets, fetch: outbound, now: clock.now });
  const core = await startCore(coreOptions(options, clock, smartthings.module), store, secrets);
  undo.push(
    () => stopGo2rtcForShutdown(core.supervisor, options.log.forArea('hub.go2rtc')),
    () => {
      core.firewall.stop();
      core.cameraHealth.stop();
    },
    () => core.hub.stop(),
  );
  const alerts = new OwnerAlerts();
  const connections = await openConnections(options, store);
  const built = await buildServer({
    connections,
    store,
    logs,
    ...codecs,
    secrets,
    core,
    layout: options.layout,
    hubUpdateSourceRoutes,
    ...(options.codex === undefined ? {} : { codex: options.codex }),
    allowedOrigins: allowedOriginsOf(options),
    extensions: serverExtensions(options, clock, alerts, smartthings),
    fetch: outbound,
    clock,
    version: HUB_VERSION,
    log: options.log,
    logLines: options.logLines,
    alerts,
  });
  rememberBuilt(built, undo);
  return { lock, store, logs, ...codecs, core, built, extensions: built.extensions };
}

interface ResumeWatch {
  readonly attach: (core: Core) => void;
  readonly stop: () => void;
}

function resumeWatchOf(options: ServerOptions): ResumeWatch {
  let attached: Core | null = null;
  const resumed = (): void => {
    attached?.planner.resumed();
    attached?.google.runner.resumed();
    rearmTimers();
  };
  return {
    attach: (core): void => {
      attached = core;
    },
    stop:
      options.clock === undefined
        ? watchResume({ log: options.log, onResume: resumed })
        : (): void => undefined,
  };
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const clock = options.clock ?? systemClock;
  await mkdir(options.layout.root, { recursive: true, mode: 0o700 });
  await mkdir(dirname(options.layout.system.database.file), { recursive: true, mode: 0o700 });
  const undo: Undo[] = [];
  const starting = await listenWhileStarting(options.port, options.host ?? '0.0.0.0', options.log);
  const resume = resumeWatchOf(options);
  const stopResumeWatch = resume.stop;
  undo.push(stopResumeWatch);
  try {
    const source = hubUpdateSourceWiring(options.layout, options.hubBootRunId);
    const started = await boot(options, clock, undo, source.routes);
    resume.attach(started.core);
    const ownerToken = await started.built.access.ensureOwner();
    const host = options.host ?? '0.0.0.0';
    await starting.close();
    const address = await listen(started.built.http, options.port, host);
    const url = serviceUrl({ host, port: address.port });
    const withdraw = await startLan(options, started);
    const stopSourceWatch = await source.watch(started.built.context.live);
    undo.push(withdraw, stopSourceWatch);
    options.log.info('server.started', { port: address.port, version: HUB_VERSION });
    started.store.startRetention();
    return {
      ownerToken,
      url,
      rotateOwnerToken: () => started.built.access.rotateOwner(),
      status: started.built.context.status,
      publicStatus: started.built.context.publicStatus,
      stop: async (): Promise<void> => {
        started.core.supervisor.expectStop();
        stopResumeWatch();
        await stopSourceWatch();
        await stopAll(started, withdraw, options.log.forArea('hub.go2rtc'));
      },
    };
  } catch (cause) {
    await starting.close();
    await rollBack(undo, options.log);
    throw cause;
  }
}

async function closeListeners(built: BuiltServer): Promise<void> {
  const listeners = [built.http, ...(built.secure === null ? [] : [built.secure])];
  await Promise.all(
    listeners.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
          server.closeAllConnections();
        }),
    ),
  );
}

async function startLan(options: ServerOptions, started: Started): Promise<() => Promise<void>> {
  const connections = started.built.context.connections;
  if (connections === undefined)
    throw new Error('The hub connection identity was not initialized.');
  if (options.lan === undefined) {
    connections.listening(null);
    return () => Promise.resolve();
  }
  const server = started.built.secure;
  if (server === null) throw new Error('The encrypted LAN listener was not initialized.');
  const listener = await listen(server, options.lan.port, options.lan.host ?? '0.0.0.0');
  connections.listening(listener);
  started.core.firewall.connectionsChanged(connectionPortNeeds(listener, false));
  if (options.lan.advertise === false) return () => Promise.resolve();
  return advertiseHub({
    identity: connections.tls.identity,
    listener,
    log: options.log.forArea('hub.network'),
    ...(options.mdns === undefined ? {} : { mdns: options.mdns }),
    changed: (status) => {
      connections.discoveryChanged(status);
      started.core.firewall.connectionsChanged(
        connectionPortNeeds(listener, status.state === 'advertising'),
      );
    },
    networkChanged: () => {
      started.core.firewall.connectionsChanged(
        connectionPortNeeds(listener, connections.metadata().discovery.state === 'advertising'),
      );
    },
  });
}

function rememberBuilt(built: BuiltServer, undo: Undo[]): void {
  undo.push(
    () => closeListeners(built),
    built.stop,
    () => Promise.all(built.extensions.map((extension) => extension.stop())).then(() => undefined),
  );
}
