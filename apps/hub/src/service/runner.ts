import { pid } from 'node:process';
import { Logger } from '@smarteverything/logging';
import { startServer, type RunningServer } from '../start';
import { HUB_VERSION } from '../version';
import {
  RESTART_EXIT_CODE,
  RESTART_REQUEST_FILE,
  readServiceConfig,
  type ServiceConfig,
  type ServiceRole,
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
  readonly server: RunningServer;
  readonly shutdown: (code: number) => Promise<void>;
}

export class RoleUnavailableError extends Error {
  override readonly name = 'RoleUnavailableError';

  constructor(role: ServiceRole) {
    super(
      `This SmartEverything version can only run as the home's server; service.json asks for the ${role} role.`,
    );
  }
}

class Lifecycle {
  server: RunningServer | null = null;
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
  config: ServiceConfig,
  log: Logger,
  lifecycle: Lifecycle,
): Parameters<typeof startServer>[0] {
  return {
    dataDirectory: host.dataDirectory,
    logLines: lifecycle.files.logFile.lines,
    port: config.port,
    host: config.host,
    go2rtcBinary: config.go2rtcBinary,
    go2rtcApiPort: config.go2rtcApiPort,
    webrtcPort: config.webrtcPort,
    ...(config.allowedOrigins === undefined ? {} : { allowedOrigins: config.allowedOrigins }),
    log,
    fatal: (cause): void => {
      log.exception('service.fatal', cause);
      void lifecycle.shutdown(1);
    },
  };
}

export async function runService(host: ServiceHost): Promise<RunningService> {
  const logFile = await openLogFile(host.dataDirectory);
  const config = await readServiceConfig(host.dataDirectory);
  if (config.role !== 'hub') {
    await logFile.close();
    throw new RoleUnavailableError(config.role);
  }
  Logger.configure({
    level: config.logLevel,
    sink: logFile.sink,
    context: { platform: 'server', release: HUB_VERSION },
  });
  const log = new Logger('hub.service');
  const pidFile = await writePidFile(host.dataDirectory, pid);
  const lifecycle = new Lifecycle(host, log, { logFile, pidFile });
  try {
    const server = await startServer(serverOptions(host, config, log, lifecycle));
    lifecycle.server = server;
    lifecycle.restart = await watchRestartRequests(host.dataDirectory, {
      requested: () => {
        log.info('service.restart_requested');
        void lifecycle.shutdown(RESTART_EXIT_CODE);
      },
      failed: (cause) => {
        log.error('service.restart_watch_failed', cause);
      },
    });
    host.onSignal('SIGTERM', () => void lifecycle.shutdown(0));
    host.onSignal('SIGINT', () => void lifecycle.shutdown(0));
    lifecycle.ready = await writeReadyFile(host.dataDirectory, {
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
    throw cause;
  }
}
