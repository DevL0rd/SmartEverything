import path from 'node:path';
import { inspect } from 'node:util';
import type {
  DesktopServer,
  DesktopServiceHealth,
  DesktopServiceLogs,
  DesktopServiceStatus,
} from '@smarteverything/domain';
import type { ServiceConfig } from '@smarteverything/hub/service/configuration';
import { prepareServiceConfig, type PreparedConfig } from './config-file.js';
import { LiveLink, type OpenSocket } from './live-link.js';
import { PRIVATE_MODE, type ManagerState, type ServiceManager } from './manager.js';
import { answers, readOwnerToken, readReady, readyUrl, readNodeWindow } from './ready.js';
import type { ServiceLocations } from './locations.js';
import type { ServiceSystem } from './system.js';

const LOG_LINES = 200;

export interface ControllerOptions {
  readonly manager: ServiceManager;
  readonly locations: ServiceLocations;
  readonly system: ServiceSystem;
  readonly go2rtcBinary: string;
  readonly openSocket: OpenSocket;
  readonly timeoutMs: number;
  readonly failed: (cause: unknown) => void;
  readonly managedBy?: 'stable-app' | undefined;
}

export class ManagedByStableAppError extends Error {
  constructor() {
    super(
      'the stable SmartEverything app manages the server; SmartEverything Dev only connects to it',
    );
    this.name = 'ManagedByStableAppError';
  }
}

export class ServiceTimeoutError extends Error {
  constructor(expected: string, timeoutMs: number, detail: string) {
    super(
      `the server must be ${expected} within ${String(timeoutMs / 1000)} seconds; ${detail}. Its log is in Settings.`,
    );
    this.name = 'ServiceTimeoutError';
  }
}

export class ServiceNotRunningError extends Error {
  constructor(status: DesktopServiceStatus) {
    super(
      `the SmartEverything server must be running for the window to reach it; it is ${status.health} (${status.detail})`,
    );
    this.name = 'ServiceNotRunningError';
  }
}

interface Observed {
  readonly state: ManagerState;
  readonly url: string | null;
}

function healthOf(observed: Observed, failure: string | null): DesktopServiceHealth {
  if (!observed.state.installed) {
    return 'not-installed';
  }
  if (observed.url !== null) {
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
  readonly #live: LiveLink;
  #failure: string | null = null;
  #last = '';
  #stopWatching: (() => void) | null = null;

  constructor(options: ControllerOptions) {
    this.#options = options;
    this.#live = new LiveLink(options.openSocket, () => {
      this.refresh();
    });
  }

  get dataDirectory(): string {
    return this.#options.locations.dataDirectory;
  }

  async config(): Promise<ServiceConfig> {
    return (await this.#prepare()).config;
  }

  onChange(listener: (status: DesktopServiceStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  watch(): void {
    const { locations, system } = this.#options;
    const relevant = new Set(
      [
        locations.readyFile,
        locations.supervisorPidFile,
        locations.ownerTokenFile,
        path.join(locations.dataDirectory, 'node-window.json'),
      ].map((file) => path.basename(file)),
    );
    this.#stopWatching = system.watch(locations.dataDirectory, {
      changed: (name) => {
        if (relevant.has(name)) {
          this.refresh();
        }
      },
      failed: this.#options.failed,
    });
  }

  close(): void {
    this.#stopWatching?.();
    this.#live.drop();
  }

  refresh(): void {
    this.status().then((status) => {
      this.#publish(status);
    }, this.#options.failed);
  }

  async status(): Promise<DesktopServiceStatus> {
    const observed = await this.#observe();
    const health = healthOf(observed, this.#failure);
    if (health === 'running') {
      this.#failure = null;
    }
    return {
      manager: this.#options.manager.kind,
      health,
      installed: observed.state.installed,
      active: observed.state.active,
      url: observed.url,
      dataDirectory: this.dataDirectory,
      detail: health === 'failed' && this.#failure !== null ? this.#failure : observed.state.detail,
      linger: await this.#options.manager.linger(),
      ...(this.#options.managedBy === undefined ? {} : { managedBy: this.#options.managedBy }),
    };
  }

  async ensure(): Promise<DesktopServiceStatus> {
    return this.#attempt(async () => {
      const { manager } = this.#options;
      const configChanged = await this.#writeConfig();
      const state = await manager.state();
      if (!state.current) {
        await this.#reinstall(state);
        await manager.start();
        return this.#serving();
      }
      if (!state.active) {
        await manager.start();
        return this.#serving();
      }
      if (configChanged) {
        return this.#restarted();
      }
      return this.#serving();
    });
  }

  start(): Promise<DesktopServiceStatus> {
    return this.ensure();
  }

  stop(): Promise<DesktopServiceStatus> {
    return this.#attempt(async () => {
      await this.#options.manager.stop();
      await this.#stopped();
      return this.status();
    });
  }

  restart(): Promise<DesktopServiceStatus> {
    return this.#attempt(() => this.#restarted());
  }

  async #restarted(): Promise<DesktopServiceStatus> {
    const before = await readReady(this.#options.system, this.#options.locations);
    await this.#options.manager.restart();
    return this.#serving(before?.pid ?? null);
  }

  uninstall(): Promise<DesktopServiceStatus> {
    return this.#attempt(async () => {
      await this.#options.manager.uninstall();
      await this.#stopped();
      return this.status();
    });
  }

  async enableLinger(): Promise<DesktopServiceStatus> {
    this.#refuseUnlessManaged();
    await this.#options.manager.enableLinger();
    return this.status();
  }

  async logs(): Promise<DesktopServiceLogs> {
    const { files } = this.#options.system;
    const { logFile, outputLogFile } = this.#options.locations;
    return {
      file: logFile,
      lines: [
        ...tail(await files.read(outputLogFile), 'output: '),
        ...tail(await files.read(logFile), ''),
      ],
    };
  }

  async server(): Promise<DesktopServer> {
    const status = await this.status();
    if (status.health === 'starting') {
      await this.#serving();
    } else if (status.health !== 'running') {
      throw new ServiceNotRunningError(status);
    }
    return this.#connection();
  }

  async #connection(): Promise<DesktopServer> {
    const { system, locations } = this.#options;
    const ready = await readReady(system, locations);
    if (ready === null) {
      throw new ServiceNotRunningError(await this.status());
    }
    return 'role' in ready
      ? readNodeWindow(system, locations, ready.hub_url)
      : { url: ready.url, token: await readOwnerToken(system, locations) };
  }

  async #observe(): Promise<Observed> {
    const { system, locations, manager } = this.#options;
    const state = await manager.state();
    const ready = await readReady(system, locations);
    const connected = ready !== null && (!('role' in ready) || ready.connected);
    const url = connected && (await answers(system, readyUrl(ready))) ? readyUrl(ready) : null;
    return { state, url };
  }

  async #prepare(): Promise<PreparedConfig> {
    const file = this.#options.locations.configFile;
    return prepareServiceConfig(
      file,
      await this.#options.system.files.read(file),
      this.#options.go2rtcBinary,
    );
  }

  async #writeConfig(): Promise<boolean> {
    const prepared = await this.#prepare();
    if (prepared.changed) {
      await this.#options.system.files.write(
        this.#options.locations.configFile,
        prepared.text,
        PRIVATE_MODE,
      );
    }
    return prepared.changed;
  }

  async #reinstall(state: ManagerState): Promise<void> {
    if (state.active) {
      await this.#options.manager.stop();
      await this.#stopped();
    }
    await this.#options.manager.install();
  }

  #refuseUnlessManaged(): void {
    if (this.#options.managedBy === 'stable-app') {
      throw new ManagedByStableAppError();
    }
  }

  async #attempt(step: () => Promise<DesktopServiceStatus>): Promise<DesktopServiceStatus> {
    this.#refuseUnlessManaged();
    try {
      this.#failure = null;
      const status = await step();
      this.#publish(status);
      return status;
    } catch (error: unknown) {
      this.#failure = error instanceof Error ? error.message : String(error);
      this.refresh();
      throw error;
    }
  }

  async #serving(previousPid: number | null = null): Promise<DesktopServiceStatus> {
    await this.#until('running', async () => {
      const ready = await readReady(this.#options.system, this.#options.locations);
      return (
        ready !== null &&
        ready.pid !== previousPid &&
        ('role' in ready ? ready.connected : await answers(this.#options.system, ready.url))
      );
    });
    const status = await this.status();
    const connection = await this.#connection();
    this.#live.follow(connection.url, connection.token);
    return status;
  }

  async #stopped(): Promise<void> {
    this.#live.drop();
    await this.#until('stopped', async () => !(await this.#options.manager.state()).active);
  }

  #until(expected: string, check: () => Promise<boolean>): Promise<void> {
    const { system, locations, timeoutMs } = this.#options;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        stop();
        if (error === null) {
          resolve();
        } else {
          reject(error instanceof Error ? error : new Error(inspect(error)));
        }
      };
      const evaluate = (): void => {
        check().then((done) => {
          if (done) {
            finish(null);
          }
        }, finish);
      };
      const timer = setTimeout(() => {
        void this.status().then((status) => {
          finish(new ServiceTimeoutError(expected, timeoutMs, status.detail));
        }, finish);
      }, timeoutMs);
      const stop = system.watch(locations.dataDirectory, { changed: evaluate, failed: finish });
      evaluate();
    });
  }

  #publish(status: DesktopServiceStatus): void {
    if (status.health === 'running') {
      this.#connection().then((connection) => {
        this.#live.follow(connection.url, connection.token);
      }, this.#options.failed);
    }
    const text = JSON.stringify(status);
    if (text === this.#last) {
      return;
    }
    this.#last = text;
    for (const listener of this.#listeners) {
      listener(status);
    }
  }
}
