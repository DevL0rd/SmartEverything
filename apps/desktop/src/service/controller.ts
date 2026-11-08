import path from 'node:path';
import { Logger } from '@smarteverything/logging';
import type {
  ComputerServiceConfig,
  ComputerServiceReady,
  DesktopServer,
  DesktopServiceHealth,
  DesktopServiceLogs,
  DesktopServiceStatus,
} from '@smarteverything/domain';
import { parseComputerConfig } from './config-file.js';
import { type ManagerState, type ServiceManager } from './manager.js';
import {
  desktopConnectionFile,
  readDesktopConnection,
  readReady,
  writeDesktopConnection,
} from './ready.js';
import type { ServiceLocations } from './locations.js';
import type { ServiceSystem } from './system.js';
import { waitFor } from './wait.js';

const LOG_LINES = 200;

const log = new Logger('desktop.service');

export interface ControllerOptions {
  readonly manager: ServiceManager;
  readonly locations: ServiceLocations;
  readonly system: ServiceSystem;
  readonly timeoutMs: number;
  readonly failed: (cause: unknown) => void;
  readonly managedBy?: 'stable-app' | undefined;
}

export class ManagedByStableAppError extends Error {
  constructor() {
    super(
      'the stable SmartEverything app manages the Computer service; SmartEverything Dev only connects to it',
    );
    this.name = 'ManagedByStableAppError';
  }
}

export class ServiceTimeoutError extends Error {
  constructor(expected: string, timeoutMs: number, detail: string) {
    super(
      `the Computer service must be ${expected} within ${String(timeoutMs / 1000)} seconds; ${detail}. Its log is in Settings.`,
    );
    this.name = 'ServiceTimeoutError';
  }
}

class ComputerNotPairedError extends Error {
  override readonly name = 'ComputerNotPairedError';

  constructor() {
    super('Pair this computer with a Hub before starting its service.');
  }
}

interface Observed {
  readonly state: ManagerState;
  readonly ready: ComputerServiceReady | null;
}

function healthOf(observed: Observed, failure: string | null): DesktopServiceHealth {
  if (!observed.state.installed) {
    return 'not-installed';
  }
  if (observed.state.active && observed.ready !== null) {
    return 'running';
  }
  if (failure !== null) {
    return 'failed';
  }
  return observed.state.active ? 'starting' : 'stopped';
}

function tail(text: string | null, prefix: string): readonly string[] {
  return (text ?? '')
    .split(/\r?\n/u)
    .filter((line) => line !== '')
    .slice(-LOG_LINES)
    .map((line) => `${prefix}${line}`);
}

export class ServiceController {
  readonly #options: ControllerOptions;
  readonly #listeners = new Set<(status: DesktopServiceStatus) => void>();
  readonly #connections = new Set<(server: DesktopServer | null) => void>();
  #lastWindow: DesktopServer | null = null;
  #connectionRevision = 0;
  #failure: string | null = null;
  #last = '';
  #stopWatching: (() => void) | null = null;

  constructor(options: ControllerOptions) {
    this.#options = options;
  }

  get dataDirectory(): string {
    return this.#options.locations.dataDirectory;
  }

  async config(): Promise<ComputerServiceConfig | null> {
    const { locations, system } = this.#options;
    return parseComputerConfig(locations.configFile, await system.files.read(locations.configFile));
  }

  onChange(listener: (status: DesktopServiceStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  onConnection(listener: (server: DesktopServer | null) => void): void {
    this.#connections.add(listener);
  }

  watch(): void {
    const { locations, system } = this.#options;
    const relevant = new Set([
      locations.readyFile,
      locations.supervisorPidFile,
      desktopConnectionFile(locations),
    ]);
    const directories = new Set([...relevant].map((file) => path.dirname(file)));
    const stops = [...directories].map((directory) =>
      system.watch(directory, {
        changed: (name) => {
          if (relevant.has(path.join(directory, name))) {
            this.refresh();
          }
        },
        failed: this.#options.failed,
      }),
    );
    this.#stopWatching = (): void => {
      for (const stop of stops) stop();
    };
    log.info('service.watching', {
      manager: this.#options.manager.kind,
      files: relevant.size,
      dataDirectory: locations.dataDirectory,
    });
  }

  close(): void {
    this.#connectionRevision += 1;
    this.#connections.clear();
    this.#stopWatching?.();
  }

  refresh(): void {
    this.status().then(
      (status) => {
        this.#publish(status);
      },
      (cause: unknown) => {
        log.error('service.refresh_failed', cause);
        this.#options.failed(cause);
      },
    );
  }

  async status(): Promise<DesktopServiceStatus> {
    const observed = await this.#observe();
    const health = healthOf(observed, this.#failure);
    log.trace('service.status_read', {
      health,
      installed: observed.state.installed,
      active: observed.state.active,
      current: observed.state.current,
      connected: observed.ready?.connected ?? false,
    });
    if (health === 'running') {
      this.#failure = null;
    }
    return {
      manager: this.#options.manager.kind,
      health,
      installed: observed.state.installed,
      active: observed.state.active,
      url: observed.ready?.connected === true ? observed.ready.hub_url : null,
      dataDirectory: this.dataDirectory,
      detail: health === 'failed' && this.#failure !== null ? this.#failure : observed.state.detail,
      linger: await this.#options.manager.linger(),
      ...(this.#options.managedBy === undefined ? {} : { managedBy: this.#options.managedBy }),
    };
  }

  async ensure(source: 'start' | 'pairing' = 'start'): Promise<DesktopServiceStatus> {
    return this.#attempt('ensure', async () => {
      const { manager } = this.#options;
      if ((await this.config()) === null) throw new ComputerNotPairedError();
      const state = await manager.state();
      log.debug('service.ensure_decided', {
        installed: state.installed,
        active: state.active,
        current: state.current,
      });
      if (!state.current) {
        await this.#reinstall(state);
        await manager.start();
        return this.#serving();
      }
      if (!state.active) {
        await manager.start();
        return this.#serving();
      }
      return source === 'pairing' ? this.#restarted() : this.#serving();
    });
  }

  start(): Promise<DesktopServiceStatus> {
    return this.ensure();
  }

  stop(): Promise<DesktopServiceStatus> {
    return this.#attempt('stop', async () => {
      await this.#options.manager.stop();
      await this.#stopped();
      return this.status();
    });
  }

  restart(): Promise<DesktopServiceStatus> {
    return this.#attempt('restart', () => this.#restarted());
  }

  async #restarted(): Promise<DesktopServiceStatus> {
    const before = await readReady(this.#options.system, this.#options.locations);
    log.debug('service.restarting', { previousPid: before?.pid ?? null });
    await this.#options.manager.restart();
    return this.#serving(before?.pid ?? null);
  }

  uninstall(): Promise<DesktopServiceStatus> {
    return this.#attempt('uninstall', async () => {
      await this.#options.manager.uninstall();
      await this.#stopped();
      return this.status();
    });
  }

  async enableLinger(): Promise<DesktopServiceStatus> {
    this.#refuseUnlessManaged();
    log.info('service.linger_enabling', { manager: this.#options.manager.kind });
    await this.#options.manager.enableLinger();
    return this.status();
  }

  async logs(): Promise<DesktopServiceLogs> {
    const { files } = this.#options.system;
    const { logFile, outputLogFile } = this.#options.locations;
    const lines = [
      ...tail(await files.read(outputLogFile), 'output: '),
      ...tail(await files.read(logFile), ''),
    ];
    log.debug('service.logs_read', () => ({ lines: lines.length, file: path.basename(logFile) }));
    return { file: logFile, lines };
  }

  server(): Promise<DesktopServer | null> {
    const { system, locations } = this.#options;
    return readDesktopConnection(system, locations);
  }

  async setWindow(window: DesktopServer | null): Promise<void> {
    const { system, locations } = this.#options;
    await writeDesktopConnection(system, locations, window);
    this.#connectionRevision += 1;
    this.#followWindow(await this.server());
  }

  async #observe(): Promise<Observed> {
    const { system, locations, manager } = this.#options;
    const state = await manager.state();
    const ready = state.current ? await readReady(system, locations) : null;
    return { state, ready };
  }

  async #reinstall(state: ManagerState): Promise<void> {
    log.info('service.reinstalling', { installed: state.installed, active: state.active });
    if (state.active) {
      await this.#options.manager.stop();
      await this.#stopped();
    }
    await this.#options.manager.install();
  }

  #refuseUnlessManaged(): void {
    if (this.#options.managedBy === 'stable-app') {
      log.warn('service.refused_managed', { managedBy: this.#options.managedBy });
      throw new ManagedByStableAppError();
    }
  }

  async #attempt(
    action: string,
    step: () => Promise<DesktopServiceStatus>,
  ): Promise<DesktopServiceStatus> {
    this.#refuseUnlessManaged();
    const operation = log.operation('service.action', {
      action,
      manager: this.#options.manager.kind,
    });
    try {
      this.#failure = null;
      const status = await step();
      this.#publish(status);
      operation.succeeded({ health: status.health, active: status.active });
      return status;
    } catch (error: unknown) {
      operation.failed(error);
      this.#failure = error instanceof Error ? error.message : String(error);
      this.refresh();
      throw error;
    }
  }

  async #serving(previousPid: number | null = null): Promise<DesktopServiceStatus> {
    await this.#until('running', async () => {
      const ready = await readReady(this.#options.system, this.#options.locations);
      return ready !== null && ready.pid !== previousPid;
    });
    const status = await this.status();
    this.#followWindow(await this.server());
    return status;
  }

  async #stopped(): Promise<void> {
    await this.#until('stopped', async () => !(await this.#options.manager.state()).active);
    await this.#options.system.files.remove(this.#options.locations.readyFile);
  }

  #until(expected: string, check: () => Promise<boolean>): Promise<void> {
    const { system, locations, timeoutMs } = this.#options;
    return waitFor({
      expected,
      check,
      timeoutMs,
      watch: (listener) => system.watch(locations.dataDirectory, listener),
      timedOut: async () =>
        new ServiceTimeoutError(expected, timeoutMs, (await this.status()).detail),
    });
  }

  #followWindow(connection: DesktopServer | null): void {
    if (this.#lastWindow?.url === connection?.url && this.#lastWindow?.token === connection?.token)
      return;
    this.#lastWindow = connection;
    for (const listener of this.#connections) listener(connection);
  }

  #publish(status: DesktopServiceStatus): void {
    const revision = ++this.#connectionRevision;
    this.server().then(
      (connection) => {
        if (revision === this.#connectionRevision) this.#followWindow(connection);
      },
      (cause: unknown) => {
        log.error('service.connection_failed', cause);
        this.#options.failed(cause);
      },
    );
    const text = JSON.stringify(status);
    if (text === this.#last) {
      return;
    }
    this.#last = text;
    log.info('service.status_changed', {
      health: status.health,
      installed: status.installed,
      active: status.active,
      manager: status.manager,
      listeners: this.#listeners.size,
    });
    for (const listener of this.#listeners) {
      listener(status);
    }
  }
}
