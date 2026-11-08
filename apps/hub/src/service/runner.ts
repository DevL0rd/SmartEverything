import { mkdir, rm } from 'node:fs/promises';
import { env, pid } from 'node:process';
import { Logger, background, setBackgroundScope } from '@smarteverything/logging';
import { verifyMarker, type HubLayout, type Location } from '../data-layout';
import type { startServer, RunningServer } from '../start';
import { HUB_VERSION } from '../version';
import { hubBootRun } from '../self-update/boot-receipt';
import { stopOnUncaught } from './uncaught';
import { RESTART_EXIT_CODE, readServiceConfig, type HubServiceConfig } from './configuration';
import { migrateHubServiceConfig } from './config-migration';
import {
  clearRequest,
  openLogFile,
  watchRequest,
  writePidFile,
  writeReadyFile,
  type LogFile,
  type PidFile,
  type ReadyFile,
  type RequestWatch,
} from './files';

export interface ServiceHost {
  readonly layout: HubLayout;
  readonly pointer: Pick<Location, 'rootId' | 'state'>;
  readonly exit: (code: number) => void;
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
}

export interface RunningService {
  readonly server: RunningServer;
  readonly shutdown: (code: number) => Promise<void>;
}

class Lifecycle {
  server: RunningServer | null = null;
  restart: RequestWatch | null = null;
  ready: ReadyFile | null = null;
  uncaught: (() => void) | null = null;
  private stopping: Promise<void> | null = null;

  constructor(
    private readonly host: ServiceHost,
    private readonly log: Logger,
    readonly files: { readonly logFile: LogFile; readonly pidFile: PidFile },
  ) {}

  shutdown(code: number): Promise<void> {
    this.stopping ??= this.stop(code);
    return this.stopping;
  }

  private async stop(code: number): Promise<void> {
    this.log.info('service.stopping', { code });
    this.restart?.stop();
    await this.ready?.remove();
    await this.server?.stop().catch((cause: unknown) => {
      this.log.error('service.stop_failed', cause);
    });
    await clearRequest(this.host.layout.system.run.restartRequest);
    await this.files.pidFile.remove();
    await this.files.logFile.close();
    this.uncaught?.();
    this.host.exit(code);
  }
}

function serverOptions(
  host: ServiceHost,
  config: HubServiceConfig,
  log: Logger,
  lifecycle: Lifecycle,
): Parameters<typeof startServer>[0] {
  return {
    layout: host.layout,
    logLines: lifecycle.files.logFile.lines,
    port: config.port,
    ...(config.lan === undefined ? {} : { lan: config.lan }),
    host: config.host,
    go2rtcBinary: config.go2rtcBinary,
    codex: {
      ...(config.codex_executable === undefined ? {} : { executable: config.codex_executable }),
      ...(config.codex_control_socket === undefined
        ? {}
        : { controlSocket: config.codex_control_socket }),
    },
    go2rtcApiPort: config.go2rtcApiPort,
    webrtcPort: config.webrtcPort,
    ...(config.allowedOrigins === undefined ? {} : { allowedOrigins: config.allowedOrigins }),
    log,
    fatal: (cause): void => {
      log.exception('service.fatal', cause);
      background(lifecycle.shutdown(1), 'lifecycle.shutdown_failed');
    },
  };
}

setBackgroundScope('hub.background');

let rejectionsGuarded = false;

function serviceLogger(): Logger {
  const log = new Logger('hub.service');
  if (!rejectionsGuarded) {
    rejectionsGuarded = true;
    process.on('unhandledRejection', (cause: unknown) => {
      log.exception('promise.unhandled', cause);
    });
  }
  return log;
}

function stopOnSignals(host: ServiceHost, lifecycle: Lifecycle): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    host.onSignal(signal, () => {
      background(lifecycle.shutdown(0), 'lifecycle.shutdown_failed');
    });
  }
}

async function prepareTemporaryFolder(layout: HubLayout): Promise<void> {
  await rm(layout.tmp, { recursive: true, force: true });
  await mkdir(layout.tmp, { recursive: true, mode: 0o700 });
  env['TMPDIR'] = layout.tmp;
}

async function checkDataFolder(host: ServiceHost): Promise<void> {
  if (host.pointer.state === 'pending-v1') return;
  await verifyMarker(host.layout, host.pointer.rootId);
}

async function openServiceFiles(
  host: ServiceHost,
  config: HubServiceConfig,
): Promise<{ readonly log: Logger; readonly logFile: LogFile; readonly pidFile: PidFile }> {
  const { run, logs } = host.layout.system;
  await prepareTemporaryFolder(host.layout);
  const logFile = await openLogFile(logs.service);
  Logger.configure({
    level: config.logLevel,
    sink: logFile.sink,
    context: { platform: 'server', release: HUB_VERSION },
  });
  const log = serviceLogger();
  if (host.pointer.state === 'pending-v1') log.info('service.layout_migration_pending');
  return { log, logFile, pidFile: await writePidFile(run.pid, pid) };
}

export async function runService(host: ServiceHost): Promise<RunningService> {
  await checkDataFolder(host);
  const { run, config: configFiles } = host.layout.system;
  const migrated = await migrateHubServiceConfig(configFiles.service);
  const config = await readServiceConfig(configFiles.service);
  const { log, logFile, pidFile } = await openServiceFiles(host, config);
  if (migrated) log.info('hub.config_migrated', { file: configFiles.service });
  const lifecycle = new Lifecycle(host, log, { logFile, pidFile });
  const watching = stopOnUncaught(process, log, (code) => lifecycle.shutdown(code));
  lifecycle.uncaught = watching;
  try {
    const { startServer } = await import('../start');
    const hubBootRunId = await hubBootRun(log);
    const server = await startServer({
      ...serverOptions(host, config, log, lifecycle),
      ...(hubBootRunId === undefined ? {} : { hubBootRunId }),
    });
    lifecycle.server = server;
    lifecycle.restart = await watchRequest(run.restartRequest, {
      requested: () => {
        log.info('service.restart_requested');
        background(lifecycle.shutdown(RESTART_EXIT_CODE), 'lifecycle.shutdown_failed');
      },
      failed: (cause) => {
        log.error('service.restart_watch_failed', cause);
      },
    });
    stopOnSignals(host, lifecycle);
    lifecycle.ready = await writeReadyFile(run.ready, {
      pid,
      url: server.url,
      version: HUB_VERSION,
    });
    log.info('service.started', { url: server.url });
    return { server, shutdown: (code) => lifecycle.shutdown(code) };
  } catch (cause) {
    log.exception('service.start_failed', cause);
    lifecycle.restart?.stop();
    await lifecycle.server?.stop().catch((stopCause: unknown) => {
      log.error('service.stop_failed', stopCause);
    });
    await pidFile.remove();
    await logFile.close();
    watching();
    throw cause;
  }
}
