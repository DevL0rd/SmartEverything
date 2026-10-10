import type { ServiceLaunch } from '../../src/service/definitions.js';
import { serviceLocations, type ServiceLocations } from '../../src/service/locations.js';
import {
  CommandFailedError,
  type CommandResult,
  type ServiceFiles,
  type ServiceSystem,
  type WatchHandlers,
} from '../../src/service/system.js';

const DATA = '/home/ann/.config/SmartEverything';

export const LAUNCH: ServiceLaunch = {
  executable: '/opt/SmartEverything/smarteverything',
  entry: '/opt/SmartEverything/resources/service/service.mjs',
  dataDirectory: DATA,
  path: '/usr/local/bin:/usr/bin',
};

export const LOCATIONS: ServiceLocations = serviceLocations({
  home: '/home/ann',
  dataDirectory: DATA,
  xdgConfigHome: undefined,
});

export type Responder = (file: string, args: readonly string[]) => string | CommandFailedError;

export function failure(command: string, exitCode: number): CommandFailedError {
  return new CommandFailedError(command, exitCode, `exited with code ${String(exitCode)}`, '');
}

export class FakeSystem implements ServiceSystem {
  readonly commands: string[] = [];
  readonly stored = new Map<string, string>();
  readonly modes = new Map<string, number>();
  readonly alive = new Set<number>();
  readonly serving = new Set<string>();
  readonly files: ServiceFiles;
  private readonly watching = new Set<WatchHandlers>();
  private responder: Responder = () => '';

  constructor() {
    this.files = {
      read: (file): Promise<string | null> => Promise.resolve(this.stored.get(file) ?? null),
      write: (file, text, mode): Promise<void> => {
        this.modes.set(file, mode);
        this.touch(file, text);
        return Promise.resolve();
      },
      remove: (file): Promise<void> => {
        this.touch(file, null);
        return Promise.resolve();
      },
    };
  }

  respond(responder: Responder): void {
    this.responder = responder;
  }

  touch(file: string, text: string | null): void {
    if (text === null) {
      this.stored.delete(file);
    } else {
      this.stored.set(file, text);
    }
    const name = file.slice(file.lastIndexOf('/') + 1);
    for (const handlers of [...this.watching]) {
      handlers.changed(name);
    }
  }

  watchers(): number {
    return this.watching.size;
  }

  readonly run = (file: string, args: readonly string[]): Promise<CommandResult> => {
    this.commands.push([file, ...args].join(' '));
    const answer = this.responder(file, args);
    return answer instanceof CommandFailedError
      ? Promise.reject(answer)
      : Promise.resolve({ stdout: answer });
  };

  readonly isAlive = (processId: number): boolean => this.alive.has(processId);

  readonly watch = (_directory: string, handlers: WatchHandlers): (() => void) => {
    this.watching.add(handlers);
    return () => {
      this.watching.delete(handlers);
    };
  };

  readonly fetch = (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    return this.serving.has(url.origin)
      ? Promise.resolve(new Response('{}', { status: 200 }))
      : Promise.reject(new TypeError('fetch failed'));
  };
}

export function fakeSystem(): FakeSystem {
  return new FakeSystem();
}
