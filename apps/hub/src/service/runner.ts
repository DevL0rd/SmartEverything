import { pid } from 'node:process';
import { Logger, background, setBackgroundScope } from '@smarteverything/logging';
import type { startServer, RunningServer } from '../start';
import type { startNode } from '../node/bootstrap';
import { HUB_VERSION } from '../version';
import {
  RESTART_EXIT_CODE,
  RESTART_REQUEST_FILE,
  readServiceConfig,
  type HubServiceConfig,
  type ServiceConfig,
} from './configuration';
import {
  clearRequest,
  openLogFile,
  watchRestartRequests,
  writePidFile,
  writeReadyFile,
  type LogFile,
  type PidFile,
  type ReadyFile,
  type RequestWatch,
} from './files';

export interface ServiceHost {
  readonly dataDirectory: string;
  readonly exit: (code: number) => void;
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
}

export interface RunningService {
  readonly server: RunningServer | Awaited<ReturnType<typeof startNode>>;
  readonly shutdown: (code: number) => Promise<void>;
}

class Lifecycle {
  server: RunningServer | Awaited<ReturnType<typeof startNode>> | null = null;
  restart: RequestWatch | null = null;
  ready: ReadyFile | null = null;
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
    await clearRequest(this.host.dataDirectory, RESTART_REQUEST_FILE);
    await this.files.pidFile.remove();
    await this.files.logFile.close();
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
    dataDirectory: host.dataDirectory,
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

async function startRole(
  host: ServiceHost,
  config: ServiceConfig,
  log: Logger,
  lifecycle: Lifecycle,
): Promise<RunningService['server']> {
  if (config.role === 'node') {
    const { startNode } = await import('../node/bootstrap');
    return startNode({
      dataDirectory: host.dataDirectory,
      config,
      log,
      restart: (): void => {
        background(lifecycle.shutdown(RESTART_EXIT_CODE), 'lifecycle.shutdown_failed');
      },
    });
  }
  const { startServer } = await import('../start');
  return startServer(serverOptions(host, config, log, lifecycle));
}

export async function runService(host: ServiceHost): Promise<RunningService> {
  const logFile = await openLogFile(host.dataDirectory);
  const config = await readServiceConfig(host.dataDirectory);
  Logger.configure({
    level: config.logLevel,
    sink: logFile.sink,
    context: { platform: 'server', release: HUB_VERSION },
  });
  const log = serviceLogger();
  const pidFile = await writePidFile(host.dataDirectory, pid);
  const lifecycle = new Lifecycle(host, log, { logFile, pidFile });
  try {
    const server = await startRole(host, config, log, lifecycle);
    lifecycle.server = server;
    lifecycle.restart = await watchRestartRequests(host.dataDirectory, {
      requested: () => {
        log.info('service.restart_requested');
        background(lifecycle.shutdown(RESTART_EXIT_CODE), 'lifecycle.shutdown_failed');
      },
      failed: (cause) => {
        log.error('service.restart_watch_failed', cause);
      },
    });
    stopOnSignals(host, lifecycle);
    if (config.role === 'hub') {
      lifecycle.ready = await writeReadyFile(host.dataDirectory, {
        pid,
        url: server.url,
        version: HUB_VERSION,
      });
      log.info('service.started', { url: server.url });
    } else {
      log.info('service.node_started');
    }
    return { server, shutdown: (code) => lifecycle.shutdown(code) };
  } catch (cause) {
    log.exception('service.start_failed', cause);
    lifecycle.restart?.stop();
    await lifecycle.server?.stop().catch((stopCause: unknown) => {
      log.error('service.stop_failed', stopCause);
    });
    await pidFile.remove();
    await logFile.close();
    throw cause;
  }
}
