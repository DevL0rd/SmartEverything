import type { ProviderProblem } from '@smarteverything/domain';
import {
  installedAppsMessage,
  readTvMessage,
  type InstalledApp,
  type TvMessage,
} from '@smarteverything/smartthings';
import type WebSocket from 'ws';

export class TvConnectionError extends Error {
  override readonly name = 'TvConnectionError';
  readonly problem: ProviderProblem = 'network';

  constructor(
    readonly host: string,
    readonly reason: string,
  ) {
    super(
      `The Samsung TV at ${host} could not be reached over its remote-control socket: ${reason}.`,
    );
  }
}

export class TvRefusedError extends Error {
  override readonly name = 'TvRefusedError';
  readonly problem: ProviderProblem = 'bad_credentials';

  constructor(
    readonly host: string,
    readonly reason: string,
  ) {
    super(`The Samsung TV at ${host} refused the remote control: ${reason}.`);
  }
}

function textOf(data: WebSocket.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}

function parse(data: WebSocket.RawData): TvMessage | Error {
  try {
    return readTvMessage(textOf(data));
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause));
  }
}

type Listener = (message: TvMessage) => void;

export type OpenedOn = 'connected' | 'ready';

function refusal(host: string, message: TvMessage): Error | null {
  if (message.kind === 'unauthorized') {
    return new TvRefusedError(host, 'the request was declined on the TV or the token was rejected');
  }
  if (message.kind === 'timed_out') {
    return new TvRefusedError(host, 'nobody accepted the request on the TV in time');
  }
  return null;
}

export class TvConnection {
  private readonly listeners = new Set<Listener>();
  private readonly problems = new Set<(problem: Error) => void>();

  private constructor(
    private readonly socket: WebSocket,
    readonly host: string,
    readonly token: string | null,
  ) {
    socket.on('message', (data) => {
      const message = parse(data);
      if (message instanceof Error) {
        this.report(message);
        return;
      }
      this.listeners.forEach((listener) => {
        listener(message);
      });
    });
    socket.on('error', (cause) => {
      this.report(new TvConnectionError(host, cause.message));
    });
  }

  static open(
    socket: WebSocket,
    host: string,
    timeoutMs: number,
    openedOn: OpenedOn,
  ): Promise<TvConnection> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let token: string | null = null;
      const fail = (cause: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.terminate();
        reject(cause);
      };
      const timer = setTimeout(() => {
        fail(new TvConnectionError(host, `no answer within ${String(timeoutMs)} ms`));
      }, timeoutMs);
      socket.on('error', (cause) => {
        fail(new TvConnectionError(host, cause.message));
      });
      socket.on('close', (code) => {
        fail(new TvConnectionError(host, `the socket closed with code ${String(code)}`));
      });
      socket.on('message', (data) => {
        const message = parse(data);
        if (message instanceof Error) {
          fail(message);
          return;
        }
        const refused = refusal(host, message);
        if (refused !== null) {
          fail(refused);
          return;
        }
        if (message.kind === 'connected') {
          token = message.token;
        }
        if (message.kind === openedOn) {
          settled = true;
          clearTimeout(timer);
          socket.removeAllListeners();
          resolve(new TvConnection(socket, host, token));
        }
      });
    });
  }

  get isOpen(): boolean {
    return this.socket.readyState === this.socket.OPEN;
  }

  onClose(listener: () => void): void {
    this.socket.once('close', listener);
  }

  onProblem(listener: (problem: Error) => void): void {
    this.problems.add(listener);
  }

  private report(problem: Error): void {
    this.problems.forEach((listener) => {
      listener(problem);
    });
  }

  send(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.send(text, (cause) => {
        if (cause instanceof Error) {
          reject(new TvConnectionError(this.host, cause.message));
        } else {
          resolve();
        }
      });
    });
  }

  onMessage(listener: Listener): void {
    this.listeners.add(listener);
  }

  waitFor<T>(
    pick: (message: TvMessage) => T | undefined,
    timeoutMs: number,
    missing: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const listener: Listener = (message) => {
        const picked = pick(message);
        if (picked !== undefined) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(picked);
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new TvConnectionError(this.host, missing));
      }, timeoutMs);
      this.listeners.add(listener);
    });
  }

  async installedApps(timeoutMs: number): Promise<readonly InstalledApp[]> {
    const answer = this.waitFor(
      (message) => (message.kind === 'installed_apps' ? message.apps : undefined),
      timeoutMs,
      'the installed apps were not listed in time',
    );
    await this.send(installedAppsMessage());
    return answer;
  }

  close(): void {
    this.socket.close();
  }
}
