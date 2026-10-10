import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { HubStatus, PublicStatus } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import { systemClock, type Clock } from './clock';
import { lockDataDirectory, type DataLock } from './data-lock';
import type { RunningExtension, ServerExtension } from './extensions';
import { bodyAlertsExtension } from './extensions/body-alerts';
import { computersExtension } from './computers/extension';
import { phonesExtension } from './phones/extension';
import { mcpExtension } from './extensions/mcp';
import { OwnerAlerts } from './extensions/owner-alerts';
import { privacyExtension } from './extensions/privacy';
import { nodeFirewallSystem, type FirewallSystem } from './firewall/system';
import { pushExtension } from './extensions/push';
import { smartThingsWiring } from './extensions/smartthings';
import type { ModuleRegistry } from './providers/registry-types';
import { openSecretStore } from './secrets/open';
import { buildServer, type BuiltServer } from './server/build';
import { DATABASE_FILE } from './service/configuration';
import type { LogLines } from './service/log-lines';
import { startCore, type Core } from './services';
import { openStore, type Store } from './store/store';
import { HUB_VERSION } from './version';

export const DEFAULT_ORIGINS: readonly string[] = ['app://smarteverything'];

export interface ServerOptions {
  readonly dataDirectory: string;
  readonly port: number;
  readonly host?: string;
  readonly go2rtcBinary: string;
  readonly go2rtcApiPort?: number;
  readonly go2rtcRtspPort?: number;
  readonly webrtcPort?: number;
  readonly log: Logger;
  readonly logLines: LogLines;
  readonly fatal: (cause: Error) => void;
  readonly modules?: ModuleRegistry;
  readonly allowedOrigins?: readonly string[];
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

function listen(built: BuiltServer, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    built.http.once('error', reject);
    built.http.listen(port, host, () => {
      built.http.off('error', reject);
      const address = built.http.address();
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

function loopbackOf(host: string): string {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
}

async function stopAll(started: Started): Promise<void> {
  started.built.stop();
  await new Promise<void>((resolve) => {
    started.built.http.close(() => {
      resolve();
    });
    started.built.http.closeAllConnections();
  });
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
  const built = await buildServer({
    store,
    secrets,
    core,
    dataDirectory: options.dataDirectory,
    allowedOrigins: new Set(options.allowedOrigins ?? DEFAULT_ORIGINS),
    extensions: [
      mcpExtension({ clock, alerts }),
      pushExtension({ fetch: outbound, now: clock.now, alerts }),
      smartthings.extension,
      privacyExtension(),
      bodyAlertsExtension({ alerts }),
      computersExtension(clock.now),
      phonesExtension(),
      ...(options.extensions ?? []),
    ],
    fetch: outbound,
    clock,
    version: HUB_VERSION,
    log: options.log,
    logLines: options.logLines,
    alerts,
  });
  undo.push(built.stop, () =>
    Promise.all(built.extensions.map((extension) => extension.stop())).then(() => undefined),
  );
  return { lock, store, core, built, extensions: built.extensions };
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const clock = options.clock ?? systemClock;
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  const undo: Undo[] = [];
  try {
    const started = await boot(options, clock, undo);
    const ownerToken = await started.built.access.ensureOwner();
    const host = options.host ?? '0.0.0.0';
    const address = await listen(started.built, options.port, host);
    options.log.info('server.started', { port: address.port, version: HUB_VERSION });
    return {
      ownerToken,
      url: `http://${loopbackOf(host)}:${String(address.port)}`,
      rotateOwnerToken: () => started.built.access.rotateOwner(),
      status: started.built.context.status,
      publicStatus: started.built.context.publicStatus,
      stop: () => stopAll(started),
    };
  } catch (cause) {
    await rollBack(undo, options.log);
    throw cause;
  }
}
