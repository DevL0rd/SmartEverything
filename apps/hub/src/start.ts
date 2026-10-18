import { connectionPortNeeds } from './network/firewall';
import { HubConnections } from './network/connections';
import { openHubIdentity } from './network/identity';
import { advertiseHub } from './network/mdns-advertise';
import type { Server } from 'node:http';
import type { PreviewGatewayConfig } from './preview/gateway';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { HubStatus, PublicStatus } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import { rearmTimers, systemClock, type Clock } from './clock';
import { lockDataDirectory, type DataLock } from './data-lock';
import type { RunningExtension, ServerExtension } from './extensions';
import { bodyAlertsExtension } from './extensions/body-alerts';
import { computersExtension } from './computers/extension';
import { machineUpdatesExtension } from './updates/extension';
import { phonesExtension } from './phones/extension';
import { mcpExtension } from './extensions/mcp';
import { OwnerAlerts } from './extensions/owner-alerts';
import { privacyExtension } from './extensions/privacy';
import { nodeFirewallSystem, type FirewallSystem } from './firewall/system';
import { pushExtension } from './extensions/push';
import { smartThingsWiring } from './extensions/smartthings';
import type { ModuleRegistry } from './providers/registry-types';
import { watchResume } from './clock/resume-watch';
import { openSecretStore } from './secrets/open';
import { buildServer, type BuiltServer } from './server/build';
import { originAllowList } from './server/origin-allow-list';
import { DATABASE_FILE, serviceUrl } from './service/configuration';
import type { LogLines } from './service/log-lines';
import { startCore, type Core } from './services';
import { openStore, type Store } from './store/store';
import { HUB_VERSION } from './version';

export const DEFAULT_ORIGINS: readonly string[] = ['app://smarteverything'];

export interface ServerOptions {
  readonly lan?: { readonly port: number; readonly host?: string; readonly advertise?: boolean };
  readonly preview?: PreviewGatewayConfig;
  readonly dataDirectory: string;
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
  readonly wakeDiagnostics?: boolean;
  readonly log: Logger;
  readonly logLines: LogLines;
  readonly fatal: (cause: Error) => void;
  readonly modules?: ModuleRegistry;
  readonly allowedOrigins?: readonly string[];
  readonly developmentOrigins?: boolean;
  readonly extensions?: readonly ServerExtension[];
  readonly clock?: Clock;
  readonly fetch?: typeof fetch;
  readonly firewall?: FirewallSystem;
}

export interface RunningServer {
  readonly ownerToken: string;
  readonly url: string;
  readonly rotateOwnerToken: () => Promise<string>;
  readonly status: () => HubStatus;
  readonly publicStatus: () => PublicStatus;
  readonly stop: () => Promise<void>;
}

interface Started {
  readonly lock: DataLock;
  readonly store: Store;
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
  return [
    mcpExtension({ clock, alerts }),
    pushExtension({ fetch: options.fetch ?? fetch, now: clock.now, alerts }),
    smartthings.extension,
    privacyExtension(),
    bodyAlertsExtension({ alerts }),
    computersExtension(clock.now),
    phonesExtension(clock.now),
    machineUpdatesExtension(),
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

async function stopAll(started: Started, withdraw: () => Promise<void>): Promise<void> {
  await withdraw();
  await started.built.stop();
  await closeListeners(started.built);
  await Promise.all(started.extensions.map((extension) => extension.stop()));
  await started.core.hub.stop();
  started.core.firewall.stop();
  await started.core.supervisor.stop();
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
    dataDirectory: options.dataDirectory,
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
    log: options.log,
    fatal: options.fatal,
  };
}

async function boot(options: ServerOptions, clock: Clock, undo: Undo[]): Promise<Started> {
  const lock = await lockDataDirectory(options.dataDirectory);
  undo.push(lock.release);
  const secrets = await openSecretStore(options.dataDirectory, options.log);
  const store = openStore({
    path: join(options.dataDirectory, DATABASE_FILE),
    log: options.log,
    now: clock.now,
    systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  undo.push(store.close);
  const outbound = options.fetch ?? fetch;
  const smartthings = smartThingsWiring({ secrets, fetch: outbound, now: clock.now });
  const core = await startCore(coreOptions(options, clock, smartthings.module), store, secrets);
  undo.push(
    () => core.supervisor.stop(),
    () => {
      core.firewall.stop();
    },
    () => core.hub.stop(),
  );
  const alerts = new OwnerAlerts();
  const connections = new HubConnections(await openHubIdentity(options.dataDirectory), store);
  const built = await buildServer({
    connections,
    store,
    secrets,
    core,
    dataDirectory: options.dataDirectory,
    wakeDiagnostics: options.wakeDiagnostics ?? false,
    ...(options.preview === undefined ? {} : { preview: options.preview }),
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
  return {
    lock,
    store,
    core,
    built,
    extensions: built.extensions,
  };
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const clock = options.clock ?? systemClock;
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  const undo: Undo[] = [];
  const stopResumeWatch =
    options.clock === undefined
      ? watchResume({ log: options.log, onResume: rearmTimers })
      : (): void => undefined;
  undo.push(stopResumeWatch);
  try {
    const started = await boot(options, clock, undo);
    const ownerToken = await started.built.access.ensureOwner();
    const host = options.host ?? '0.0.0.0';
    const address = await listen(started.built.http, options.port, host);
    const url = serviceUrl({ host, port: address.port });
    const withdraw = await startLan(options, started, url);
    undo.push(withdraw);
    options.log.info('server.started', { port: address.port, version: HUB_VERSION });
    return {
      ownerToken,
      url,
      rotateOwnerToken: () => started.built.access.rotateOwner(),
      status: started.built.context.status,
      publicStatus: started.built.context.publicStatus,
      stop: async (): Promise<void> => {
        stopResumeWatch();
        await stopAll(started, withdraw);
      },
    };
  } catch (cause) {
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

async function startLan(
  options: ServerOptions,
  started: Started,
  loopback: string,
): Promise<() => Promise<void>> {
  const connections = started.built.context.connections;
  if (connections === undefined)
    throw new Error('The hub connection identity was not initialized.');
  if (options.lan === undefined) {
    connections.listening(loopback, null);
    return () => Promise.resolve();
  }
  const server = started.built.secure;
  if (server === null) throw new Error('The encrypted LAN listener was not initialized.');
  const listener = await listen(server, options.lan.port, options.lan.host ?? '0.0.0.0');
  connections.listening(loopback, listener);
  started.core.firewall.connectionsChanged(connectionPortNeeds(listener, false));
  if (options.lan.advertise === false) return () => Promise.resolve();
  return advertiseHub({
    identity: connections.tls.identity,
    listener,
    log: options.log.forArea('hub.network'),
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
