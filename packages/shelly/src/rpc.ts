import { randomUUID } from 'node:crypto';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { ShellyDigest, type ShellyAuth } from './digest';
import { ShellyAuthenticationError, ShellyConnectionError, ShellyRpcError } from './rpc-errors';

const REQUEST_MS = 10000;
const FRAME = z.object({
  id: z.int().nonnegative().optional(),
  src: z.string().min(1),
  dst: z.string().optional(),
  result: JSON_VALUE.optional(),
  error: z.object({ code: z.int(), message: z.string() }).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), JSON_VALUE).optional(),
});
export type ShellyRpcFrame = z.output<typeof FRAME> & { readonly sequence: number };
export type ShellyNotification = Pick<ShellyRpcFrame, 'src' | 'method' | 'params' | 'sequence'>;

export interface ShellyTransport {
  send(text: string): void;
  close(): void;
}
export interface ShellyRpcOptions {
  readonly id: string;
  readonly password: string | null;
  readonly transport: ShellyTransport;
  readonly requestMs?: number;
  readonly notification: (notification: ShellyNotification) => void;
  readonly closed: (cause: unknown) => void;
}
interface Pending {
  readonly method: string;
  readonly startedAt: number;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (frame: ShellyRpcFrame) => void;
  readonly reject: (cause: unknown) => void;
}

export function shellyRpcFrame(text: string): z.output<typeof FRAME> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new ShellyConnectionError('decode', 'the device sent malformed JSON', cause);
  }
  return FRAME.parse(raw);
}

export class ShellyRpc {
  private readonly pending = new Map<number, Pending>();
  private readonly src = `smarteverything-${randomUUID()}`;
  private auth: ShellyDigest;
  private nextId = 0;
  private sequence = 0;
  private stopped = false;
  private readonly log: Logger;

  constructor(private readonly options: ShellyRpcOptions) {
    this.auth = new ShellyDigest(options.password);
    this.log = new Logger('hub.shelly-rpc', { deviceId: options.id });
    this.log.debug('rpc.created', {
      source: this.src,
      authenticated: options.password !== null,
      requestMs: options.requestMs ?? REQUEST_MS,
    });
  }

  async call<T>(method: string, params: JsonValue, schema: z.ZodType<T>): Promise<T> {
    return (await this.observedCall(method, params, schema)).value;
  }

  async observedCall<T>(
    method: string,
    params: JsonValue,
    schema: z.ZodType<T>,
  ): Promise<{ readonly value: T; readonly sequence: number }> {
    let auth = this.auth.current();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const frame = await this.request(method, params, auth);
      if (frame.error === undefined) {
        if (frame.result === undefined)
          throw new ShellyConnectionError(method, 'the reply has no result');
        return { value: schema.parse(frame.result), sequence: frame.sequence };
      }
      if (frame.error.code !== 401) {
        this.log.warn('rpc.rejected', {
          method,
          code: frame.error.code,
          messageLength: frame.error.message.length,
          sequence: frame.sequence,
        });
        throw new ShellyRpcError(method, frame.error.code, frame.error.message);
      }
      this.log.debug('rpc.challenged', { method, attempt: attempt + 1 });
      auth = this.auth.answer(frame.error.message);
    }
    this.log.warn('rpc.auth_rejected', { method, attempts: 3 });
    throw new ShellyAuthenticationError('the device rejected the password');
  }

  setPassword(password: string | null): void {
    this.log.debug('rpc.password_changed', { authenticated: password !== null });
    this.auth = new ShellyDigest(password);
  }

  receive(text: string): void {
    if (this.stopped) return;
    let frame: ShellyRpcFrame;
    try {
      frame = { ...shellyRpcFrame(text), sequence: ++this.sequence };
    } catch (cause) {
      this.log.warn('rpc.decode_failed', { bytes: text.length });
      this.fail(cause);
      return;
    }
    this.log.trace('rpc.received', {
      bytes: text.length,
      sequence: frame.sequence,
      id: frame.id ?? null,
      method: frame.method ?? null,
    });
    if (frame.src !== this.options.id) {
      this.log.warn('rpc.identity_mismatch', { sequence: frame.sequence });
      this.fail(
        new ShellyConnectionError('identity', 'the replying device is not the enrolled one'),
      );
      return;
    }
    if (frame.dst !== undefined && frame.dst !== this.src) {
      this.skipped('other_destination', frame);
      return;
    }
    if (frame.id === undefined) {
      this.options.notification(frame);
      return;
    }
    const pending = this.pending.get(frame.id);
    if (pending === undefined) {
      this.skipped('no_pending_request', frame);
      return;
    }
    this.replied(pending, frame, frame.id);
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
    pending.resolve(frame);
  }

  close(): void {
    this.fail(new ShellyConnectionError('socket', 'the connection was stopped'));
  }

  fail(cause: unknown): void {
    if (this.stopped) return;
    this.stopped = true;
    this.log.info('rpc.closed', {
      pendingRequests: this.pending.size,
      reason: cause instanceof Error ? cause.name : typeof cause,
    });
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(cause);
    }
    this.pending.clear();
    this.options.transport.close();
    this.options.closed(cause);
  }

  private skipped(reason: string, frame: ShellyRpcFrame): void {
    this.log.debug('rpc.frame_skipped', { reason, id: frame.id ?? null, sequence: frame.sequence });
  }

  private replied(pending: Pending, frame: ShellyRpcFrame, id: number): void {
    this.log.debug('rpc.replied', () => ({
      method: pending.method,
      id,
      sequence: frame.sequence,
      ok: frame.error === undefined,
      durationMs: Date.now() - pending.startedAt,
    }));
  }

  private timedOut(method: string, id: number, startedAt: number): void {
    this.log.warn('rpc.timeout', {
      method,
      id,
      durationMs: Date.now() - startedAt,
      pendingRequests: this.pending.size,
    });
  }

  private request(
    method: string,
    params: JsonValue,
    auth: ShellyAuth | null,
  ): Promise<ShellyRpcFrame> {
    if (this.stopped) {
      this.log.debug('rpc.request_skipped', { method, reason: 'offline' });
      return Promise.reject(new ShellyConnectionError(method, 'the socket is offline'));
    }
    const id = this.nextId++;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.timedOut(method, id, startedAt);
        reject(new ShellyConnectionError(method, 'the reply timed out; the outcome is unknown'));
      }, this.options.requestMs ?? REQUEST_MS);
      this.pending.set(id, { method, startedAt, timer, resolve, reject });
      try {
        const text = JSON.stringify({
          id,
          src: this.src,
          method,
          params,
          ...(auth === null ? {} : { auth }),
        });
        this.log.debug('rpc.requested', {
          method,
          id,
          bytes: text.length,
          authenticated: auth !== null,
          pendingRequests: this.pending.size,
        });
        this.options.transport.send(text);
      } catch (cause) {
        this.log.warn('rpc.send_failed', {
          method,
          id,
          reason: cause instanceof Error ? cause.name : typeof cause,
        });
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new ShellyConnectionError(method, 'the send failed; the outcome is unknown', cause));
      }
    });
  }
}
