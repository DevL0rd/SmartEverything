import { tlsOptions } from './http-transport';
import { randomUUID } from 'node:crypto';
import type { ShellyTransportTls, JsonValue } from '@smarteverything/domain';
import WebSocket from 'ws';
import type { z } from 'zod';
import { ShellyDigest, ShellyAuthenticationError } from './rpc-auth';
import {
  rpcFrame,
  ShellyConnectionError,
  ShellyRpcError,
  type ShellyNotification,
  type ShellyPending,
  type ShellyRpcCall,
  type ShellyRpcFrame,
} from './rpc-frames';

const REQUEST_MS = 10000;
const PENDING_LIMIT = 64;
const FRAME_BYTES = 262144;
const KEEPALIVE_MS = 30000;
export interface ShellyRpcOptions {
  readonly url: string;
  readonly id: string;
  readonly password: string | null;
  readonly tls: ShellyTransportTls | null;
  readonly signal: AbortSignal;
  readonly notification: (notification: ShellyNotification) => void;
  readonly closed: (cause: unknown) => void;
}
export class ShellyRpc {
  private readonly socket: WebSocket;
  private readonly pending = new Map<number, ShellyPending>();
  private readonly src = `smarteverything-${randomUUID()}`;
  private auth: ShellyDigest;
  private nextId = 0;
  private sequence = 0;
  private stopped = false;
  private heartbeat: ReturnType<typeof setTimeout> | null = null;
  private readonly abort = (): void => {
    this.close();
  };
  constructor(private readonly options: ShellyRpcOptions) {
    this.auth = new ShellyDigest(options.password, options.id);
    this.socket = new WebSocket(options.url, {
      maxPayload: FRAME_BYTES,
      handshakeTimeout: REQUEST_MS,
      ...(options.tls === null ? {} : tlsOptions(options.tls)),
    });
    this.socket.on('message', (data) => {
      this.receive(data);
    });
    this.socket.on('error', () => {
      this.fail(new ShellyConnectionError('socket', 'the device cannot be reached'));
    });
    this.socket.on('close', () => {
      this.fail(new ShellyConnectionError('socket', 'the connection closed'));
    });
    this.socket.on('pong', () => {
      this.keepalive();
    });
    options.signal.addEventListener('abort', this.abort, { once: true });
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ShellyConnectionError('connect', 'the device did not answer in time'));
        this.close();
      }, REQUEST_MS);
      this.socket.once('open', () => {
        clearTimeout(timer);
        this.keepalive();
        resolve();
      });
      this.socket.once('close', () => {
        clearTimeout(timer);
        reject(new ShellyConnectionError('connect', 'the connection closed'));
      });
      if (this.options.signal.aborted) this.close();
    });
  }
  async call<T>(method: string, params: JsonValue, schema: z.ZodType<T>): Promise<T> {
    return (await this.observedCall(method, params, schema)).value;
  }
  async observedCall<T>(
    method: string,
    params: JsonValue,
    schema: z.ZodType<T>,
  ): Promise<{ value: T; sequence: number }> {
    let auth: ShellyRpcCall['auth'] = this.auth.current();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const frame = await this.request({ method, params, auth });
      if (frame.error === undefined) {
        if (frame.result === undefined)
          throw new ShellyConnectionError(method, 'the reply has no result');
        return { value: schema.parse(frame.result), sequence: frame.sequence ?? 0 };
      }
      if (frame.error.code !== 401) throw new ShellyRpcError(method, frame.error.code);
      auth = this.auth.answer(frame.error.message);
    }
    throw new ShellyAuthenticationError('the device rejected the password');
  }
  setPassword(password: string | null): void {
    this.auth = new ShellyDigest(password, this.options.id);
  }
  close(): void {
    this.fail(new ShellyConnectionError('socket', 'the connection was stopped'));
    this.socket.terminate();
  }
  private request(call: ShellyRpcCall): Promise<ShellyRpcFrame> {
    if (this.stopped || this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new ShellyConnectionError(call.method, 'the socket is offline'));
    if (this.pending.size >= PENDING_LIMIT)
      return Promise.reject(
        new ShellyConnectionError(call.method, 'too many requests are pending'),
      );
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ShellyConnectionError(call.method, 'the reply timed out; the outcome is unknown'),
        );
      }, REQUEST_MS);
      this.pending.set(id, { method: call.method, timer, resolve, reject });
      const frame = {
        id,
        src: this.src,
        method: call.method,
        params: call.params,
        ...(call.auth === null ? {} : { auth: call.auth }),
      };
      this.socket.send(JSON.stringify(frame), (cause) => {
        if (cause instanceof Error) {
          const pending = this.pending.get(id);
          this.pending.delete(id);
          clearTimeout(timer);
          pending?.reject(
            new ShellyConnectionError(call.method, 'the send failed; the outcome is unknown'),
          );
        }
      });
    });
  }
  private receive(data: WebSocket.RawData): void {
    if (this.stopped) return;
    try {
      const frame = { ...rpcFrame(data), sequence: ++this.sequence };
      if (frame.src !== this.options.id)
        throw new ShellyConnectionError(
          'identity',
          'the replying device differs from the enrolled device',
        );
      if (frame.dst !== undefined && frame.dst !== this.src) return;
      if (frame.id === undefined) {
        this.options.notification(frame);
        return;
      }
      const pending = this.pending.get(frame.id);
      if (pending === undefined) return;
      clearTimeout(pending.timer);
      this.pending.delete(frame.id);
      pending.resolve(frame);
    } catch (cause) {
      this.fail(cause);
      this.socket.terminate();
    }
  }
  private fail(cause: unknown): void {
    if (this.stopped) return;
    this.stopped = true;
    this.options.signal.removeEventListener('abort', this.abort);
    if (this.heartbeat !== null) clearTimeout(this.heartbeat);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(cause);
    }
    this.pending.clear();
    this.options.closed(cause);
  }
  private keepalive(): void {
    if (this.heartbeat !== null) clearTimeout(this.heartbeat);
    if (this.stopped) return;
    this.heartbeat = setTimeout(() => {
      this.socket.ping();
      this.heartbeat = setTimeout(() => {
        this.close();
      }, REQUEST_MS);
    }, KEEPALIVE_MS);
    this.heartbeat.unref();
  }
}
