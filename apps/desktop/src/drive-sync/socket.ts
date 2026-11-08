import {
  SYNC_CLIENT_MESSAGE,
  SYNC_HELLO,
  SYNC_HUB_MESSAGE,
  type SyncClientMessage,
  type SyncHubMessage,
} from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { ClientOptions, RawData, WebSocket } from 'ws';

export const DRIVE_SYNC_PATH = '/drive/sync';
export const DRIVE_SYNC_PROTOCOL = 'smarteverything-drive-sync.v1';

const CLOSE_GOING_AWAY = 1001;
const CLOSE_PROTOCOL_ERROR = 1002;
const CLOSE_POLICY = 1008;
const CLOSE_REVOKED = 4001;
const CLOSE_REPLACED = 4002;
const REFUSAL_CODES: ReadonlySet<number> = new Set([CLOSE_POLICY, CLOSE_REVOKED, CLOSE_REPLACED]);

export interface SyncSocketTransport {
  readonly socket: (url: URL, protocols: string | string[], options: ClientOptions) => WebSocket;
  readonly subscribe: (listener: () => void) => () => void;
  readonly ready: () => boolean;
}

type HubSocket = WebSocket;
type ClientState = Extract<SyncClientMessage, { readonly type: 'client_state' }>;

export type SyncClientStateReport = Omit<ClientState, 'type'>;

export interface RootHello {
  readonly indexId: string | null;
  readonly afterSeq: number;
}

export interface SyncRootBinding {
  readonly rootId: string;
  readonly hello: () => RootHello;
}

export interface ChannelClosure {
  readonly code: number;
  readonly reason: string;
  readonly refused: boolean;
}

export interface SyncSocketSink {
  readonly opened: (rootId: string) => void;
  readonly message: (rootId: string, message: SyncHubMessage) => void;
  readonly closed: (rootId: string, closure: ChannelClosure) => void;
}

export interface SyncSocketOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly clientId: string;
  readonly transport: SyncSocketTransport;
  readonly sink: SyncSocketSink;
  readonly log: Logger;
}

export class ChannelClosedError extends Error {
  constructor(readonly rootId: string) {
    super(`The sync connection for ${rootId} is not open`);
    this.name = 'ChannelClosedError';
  }
}

class HubFrameViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubFrameViolation';
  }
}

function textOf(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}

function hubMessageOf(raw: RawData, binary: boolean): SyncHubMessage {
  if (binary) throw new HubFrameViolation('The hub sent a binary frame');
  let frame: unknown;
  try {
    frame = JSON.parse(textOf(raw));
  } catch (cause) {
    throw new HubFrameViolation(`The hub sent a frame that is not JSON: ${messageOf(cause)}`);
  }
  const parsed = SYNC_HUB_MESSAGE.safeParse(frame);
  if (!parsed.success) throw new HubFrameViolation('The hub sent an unknown sync message');
  return parsed.data;
}

function socketUrl(hubUrl: string): URL {
  const url = new URL(DRIVE_SYNC_PATH, hubUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
}

function isOpen(socket: HubSocket): boolean {
  return socket.readyState === socket.OPEN;
}

class RootChannel {
  readonly #binding: SyncRootBinding;
  readonly #options: SyncSocketOptions;
  #current: HubSocket | null = null;
  #refused = false;
  #stopped = false;
  #wanted: string | null = null;
  #delivered: string | null = null;

  constructor(binding: SyncRootBinding, options: SyncSocketOptions) {
    this.#binding = binding;
    this.#options = options;
  }

  get isOpen(): boolean {
    return this.#current !== null && isOpen(this.#current);
  }

  connect(): void {
    if (this.#stopped || this.#refused || this.#current !== null) return;
    if (!this.#options.transport.ready()) {
      this.#options.log.debug('drive_sync.socket.deferred', { rootId: this.#binding.rootId });
      return;
    }
    const socket = this.#options.transport.socket(
      socketUrl(this.#options.hubUrl),
      [DRIVE_SYNC_PROTOCOL],
      { headers: { authorization: `Bearer ${this.#options.token}` } },
    );
    this.#current = socket;
    this.#delivered = null;
    this.#wire(socket);
  }

  routeChanged(): void {
    if (this.#refused) return;
    if (this.#current === null) {
      this.connect();
      return;
    }
    this.#retire('The route to the hub changed');
    this.connect();
  }

  retry(): void {
    this.#refused = false;
    if (this.#current !== null) this.#retire('A reconnect was requested');
    this.connect();
  }

  stop(): void {
    this.#stopped = true;
    const socket = this.#current;
    this.#current = null;
    socket?.terminate();
  }

  send(message: SyncClientMessage): Promise<void> {
    const socket = this.#current;
    if (socket === null || !isOpen(socket)) {
      return Promise.reject(new ChannelClosedError(this.#binding.rootId));
    }
    return this.#write(socket, JSON.stringify(SYNC_CLIENT_MESSAGE.parse(message)));
  }

  report(state: SyncClientStateReport): Promise<void> {
    this.#wanted = JSON.stringify(SYNC_CLIENT_MESSAGE.parse({ type: 'client_state', ...state }));
    return this.#flushState();
  }

  #write(socket: HubSocket, text: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      socket.send(text, (error) => {
        if (error instanceof Error) reject(error);
        else resolve();
      });
    });
  }

  async #flushState(): Promise<void> {
    const socket = this.#current;
    const text = this.#wanted;
    if (socket === null || !isOpen(socket) || text === null || text === this.#delivered) return;
    this.#delivered = text;
    try {
      await this.#write(socket, text);
    } catch (cause) {
      this.#delivered = null;
      throw cause;
    }
  }

  #wire(socket: HubSocket): void {
    socket.on('open', () => {
      if (this.#current !== socket) return;
      this.#greet(socket).catch((cause: unknown) => {
        this.#options.log.warn('drive_sync.socket.hello_failed', {
          rootId: this.#binding.rootId,
          error: messageOf(cause),
        });
        socket.terminate();
      });
    });
    socket.on('message', (raw, binary) => {
      if (this.#current === socket) this.#receive(socket, raw, binary);
    });
    socket.on('error', (cause) => {
      this.#options.log.warn('drive_sync.socket.error', {
        rootId: this.#binding.rootId,
        error: messageOf(cause),
      });
    });
    socket.on('close', (code, reason) => {
      if (this.#current !== socket) return;
      this.#current = null;
      this.#closed({ code, reason: reason.toString('utf8') });
    });
  }

  async #greet(socket: HubSocket): Promise<void> {
    const hello = SYNC_HELLO.parse({
      type: 'hello',
      clientId: this.#options.clientId,
      rootId: this.#binding.rootId,
      ...this.#binding.hello(),
    });
    await this.#write(socket, JSON.stringify(hello));
    this.#options.sink.opened(this.#binding.rootId);
    await this.#flushState();
  }

  #receive(socket: HubSocket, raw: RawData, binary: boolean): void {
    let message: SyncHubMessage;
    try {
      message = hubMessageOf(raw, binary);
    } catch (cause) {
      this.#options.log.warn('drive_sync.socket.violation', {
        rootId: this.#binding.rootId,
        error: messageOf(cause),
      });
      this.#current = null;
      socket.close(CLOSE_PROTOCOL_ERROR, 'invalid sync frame');
      this.#closed({ code: CLOSE_PROTOCOL_ERROR, reason: messageOf(cause) });
      return;
    }
    this.#options.sink.message(this.#binding.rootId, message);
  }

  #retire(reason: string): void {
    const socket = this.#current;
    this.#current = null;
    socket?.terminate();
    this.#closed({ code: CLOSE_GOING_AWAY, reason });
  }

  #closed(closure: Pick<ChannelClosure, 'code' | 'reason'>): void {
    const refused = REFUSAL_CODES.has(closure.code) || closure.code === CLOSE_PROTOCOL_ERROR;
    if (refused) this.#refused = true;
    this.#options.log.info('drive_sync.socket.closed', {
      rootId: this.#binding.rootId,
      code: closure.code,
      refused,
    });
    if (!this.#stopped) this.#options.sink.closed(this.#binding.rootId, { ...closure, refused });
  }
}

export class SyncSocket {
  readonly #channels = new Map<string, RootChannel>();
  readonly #options: SyncSocketOptions;
  readonly #unsubscribe: () => void;

  constructor(options: SyncSocketOptions) {
    this.#options = options;
    this.#unsubscribe = options.transport.subscribe(() => {
      for (const channel of this.#channels.values()) channel.routeChanged();
    });
  }

  attach(binding: SyncRootBinding): void {
    if (this.#channels.has(binding.rootId)) return;
    const channel = new RootChannel(binding, this.#options);
    this.#channels.set(binding.rootId, channel);
    channel.connect();
  }

  detach(rootId: string): void {
    this.#channels.get(rootId)?.stop();
    this.#channels.delete(rootId);
  }

  isOpen(rootId: string): boolean {
    return this.#channels.get(rootId)?.isOpen === true;
  }

  send(rootId: string, message: SyncClientMessage): Promise<void> {
    const channel = this.#channels.get(rootId);
    if (channel === undefined) return Promise.reject(new ChannelClosedError(rootId));
    return channel.send(message);
  }

  report(rootId: string, state: SyncClientStateReport): Promise<void> {
    const channel = this.#channels.get(rootId);
    if (channel === undefined) return Promise.reject(new ChannelClosedError(rootId));
    return channel.report(state);
  }

  reconnect(): void {
    for (const channel of this.#channels.values()) channel.retry();
  }

  stop(): void {
    this.#unsubscribe();
    for (const channel of this.#channels.values()) channel.stop();
    this.#channels.clear();
  }
}
