import WebSocket from 'ws';
import {
  HUB_REQUEST_TIMEOUT_MS,
  NATIVE_HUB_SOCKET_OPEN,
  NATIVE_HUB_SOCKET_SEND,
  type NativeHubSocketEvent,
} from '@smarteverything/domain';
import { HubTransportError } from './policy';
import type { HubLeasePort } from './lease';

export interface HubSocketOwner {
  readonly id: number;
  isDestroyed(): boolean;
}
interface HubSocket<Owner extends HubSocketOwner> {
  readonly scopeId: string;
  readonly owner: Owner;
  readonly socket: WebSocket;
}
export class HubSockets<Owner extends HubSocketOwner> {
  readonly #sockets = new Map<string, HubSocket<Owner>>();
  constructor(
    readonly policies: HubLeasePort,
    readonly emit: (owner: Owner, event: NativeHubSocketEvent) => void,
  ) {}
  open(owner: Owner, value: unknown): void {
    const input = NATIVE_HUB_SOCKET_OPEN.parse(value);
    const key = `${String(owner.id)}:${input.id}`;
    if (this.#sockets.has(key)) throw new HubTransportError('Hub socket ID exists');
    const httpUrl = input.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    const lease = this.policies.lease(input.scopeId, httpUrl, input.binding, input.routeGeneration);
    const url = lease.url.href.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const socket = new WebSocket(url, input.protocols, {
      ...(lease.agent === undefined ? {} : { agent: lease.agent }),
      ...(lease.signal === undefined ? {} : { signal: lease.signal }),
      followRedirects: false,
      handshakeTimeout: HUB_REQUEST_TIMEOUT_MS,
      perMessageDeflate: false,
    });
    const abort = (): void => {
      socket.terminate();
    };
    lease.signal?.addEventListener('abort', abort, { once: true });
    this.#sockets.set(key, { scopeId: input.scopeId, owner, socket });
    const send = (event: NativeHubSocketEvent): void => {
      if (this.#sockets.get(key)?.socket === socket && !owner.isDestroyed())
        this.emit(owner, event);
    };
    socket.on('open', () => {
      send({ id: input.id, kind: 'open', protocol: socket.protocol });
    });
    socket.on('message', (data, binary) => {
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      send({ id: input.id, kind: 'message', data: binary ? [...buffer] : buffer.toString('utf8') });
    });
    socket.on('error', () => {
      socket.terminate();
    });
    socket.on('close', (code, reason) => {
      if (this.#unexpectedClose(code, lease.signal) && this.#sockets.get(key)?.socket === socket)
        this.policies.failed?.(input.scopeId, input.routeGeneration);
      lease.signal?.removeEventListener('abort', abort);
      send({ id: input.id, kind: 'close', code, reason: reason.toString('utf8') });
      if (this.#sockets.get(key)?.socket === socket) this.#sockets.delete(key);
    });
  }
  #unexpectedClose(code: number, signal: AbortSignal | undefined): boolean {
    return code !== 1000 && code !== 4001 && signal?.aborted !== true;
  }
  send(owner: Owner, value: unknown): void {
    const input = NATIVE_HUB_SOCKET_SEND.parse(value);
    const socket = this.#sockets.get(`${String(owner.id)}:${input.id}`)?.socket;
    if (socket?.readyState !== WebSocket.OPEN)
      throw new HubTransportError('Hub socket is not open');
    socket.send(typeof input.data === 'string' ? input.data : Buffer.from(input.data));
  }
  close(owner: Owner, id: string): void {
    const key = `${String(owner.id)}:${id}`;
    const entry = this.#sockets.get(key);
    if (entry === undefined) return;
    entry.socket.close(1000, 'stopped');
    this.#sockets.delete(key);
    entry.socket.terminate();
  }
  clear(scopeId: string): void {
    for (const [key, entry] of this.#sockets)
      if (entry.scopeId === scopeId) {
        this.emit(entry.owner, {
          id: key.slice(key.indexOf(':') + 1),
          kind: 'close',
          code: 1001,
          reason: 'Hub trust withdrawn',
        });
        this.#sockets.delete(key);
        entry.socket.terminate();
      }
  }
  closeOwner(owner: Owner): void {
    for (const [key, entry] of this.#sockets)
      if (entry.owner === owner) {
        this.#sockets.delete(key);
        entry.socket.terminate();
      }
  }
  stop(): void {
    for (const entry of this.#sockets.values()) entry.socket.terminate();
    this.#sockets.clear();
  }
}
