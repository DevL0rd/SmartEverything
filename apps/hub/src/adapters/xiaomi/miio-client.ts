import type { Socket } from 'node:dgram';
import type { JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  decodeMessage,
  encodeMessage,
  encodeRequest,
  helloPacket,
  isUplink,
  nextMessageId,
  parseHandshake,
  parseProbeReply,
  parseResponse,
  probePacket,
  responseId,
  type Handshake,
  type MiioHeader,
  type ProbeReply,
} from '@smarteverything/xiaomi';
import { RepeatLog } from '../../providers/repeat-log';
import type { XiaomiTiming } from './dependencies';
import { failureLine } from '@smarteverything/logging';

const HANDSHAKE_LENGTH = 32;
const MAX_PACKET_LENGTH = 4096;
const MILLISECONDS_PER_SECOND = 1000;

export class MiioTimeoutError extends Error {
  override readonly name: string = 'MiioTimeoutError';

  constructor(
    readonly host: string,
    readonly step: string,
    readonly timeoutMs: number,
  ) {
    super(`The device at ${host} did not answer ${step} within ${String(timeoutMs)} ms.`);
  }
}

export class MiioUnreachableError extends MiioTimeoutError {
  override readonly name = 'MiioUnreachableError';

  constructor(
    host: string,
    step: string,
    readonly earlier: MiioTimeoutError,
  ) {
    super(host, step, earlier.timeoutMs);
    this.message = `The device at ${host} was not asked ${step}: ${earlier.message} Nothing has been heard from it since.`;
  }
}

interface Unresponsive {
  readonly afterTicket: number;
  readonly cause: MiioTimeoutError;
}

export const MESSAGE_ID_SEED_BYTES = 4;
const BITS_PER_BYTE = 8;

export class MessageIds {
  private last: number;

  constructor(start: number) {
    this.last = start;
  }

  static seeded(bytes: Uint8Array): MessageIds {
    const seed = bytes
      .subarray(0, MESSAGE_ID_SEED_BYTES)
      .reduce((value, byte) => ((value << BITS_PER_BYTE) | byte) >>> 0, 0);
    return new MessageIds(seed >>> 1);
  }

  next(): number {
    this.last = nextMessageId(this.last);
    return this.last;
  }
}

export interface MiioClientOptions {
  readonly host: string;
  readonly port: number;
  readonly token: Uint8Array;
  readonly socket: Socket;
  readonly timing: XiaomiTiming;
  readonly now: () => number;
  readonly log: Logger;
  readonly messageIds: MessageIds;
}

export type UplinkListener = (body: string, header: MiioHeader) => void;

interface Pending {
  readonly accept: (packet: Uint8Array) => boolean;
}

interface Clock {
  readonly deviceId: number;
  readonly stamp: number;
  readonly seenAt: number;
}

export class MiioClient {
  private queue: Promise<unknown> = Promise.resolve();
  private pending: Pending | null = null;
  private clock: Clock | null = null;
  private tickets = 0;
  private unresponsive: Unresponsive | null = null;
  private uplinks: UplinkListener | null = null;
  private readonly repeat: RepeatLog;

  constructor(private readonly options: MiioClientOptions) {
    this.repeat = new RepeatLog(options.log);
    options.socket.on('error', (error) => {
      options.log.warn('miio.socket_failed', { host: options.host, reason: failureLine(error) });
    });
    options.socket.on('message', (packet, sender) => {
      if (
        sender.address === options.host &&
        sender.port === options.port &&
        packet.length <= MAX_PACKET_LENGTH
      ) {
        this.receive(new Uint8Array(packet));
      }
    });
  }

  async handshake(): Promise<Handshake> {
    return this.serialized(async () => {
      const handshake = await this.exchangeHandshake();
      this.unresponsive = null;
      return handshake;
    });
  }

  async call(method: string, params: JsonValue): Promise<JsonValue> {
    const ticket = ++this.tickets;
    return this.serialized(() => this.guarded(ticket, method, params));
  }

  async probe(virtualDid: bigint): Promise<ProbeReply> {
    return this.serialized(async () => {
      const reply = await this.exchange('the push probe', probePacket(virtualDid), (packet) =>
        packet.length === HANDSHAKE_LENGTH ? parseProbeReply(packet) : undefined,
      );
      this.clock = { deviceId: reply.deviceId, stamp: reply.stamp, seenAt: this.options.now() };
      this.unresponsive = null;
      return reply;
    });
  }

  onUplink(listener: UplinkListener | null): void {
    this.uplinks = listener;
  }

  answer(header: MiioHeader, body: string): void {
    const { host, port, token, socket, log } = this.options;
    socket.send(encodeMessage(token, header, body), port, host, (error) => {
      if (error !== null) {
        log.warn('miio.answer_failed', { host, reason: failureLine(error) });
      }
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.options.socket.close(() => {
        resolve();
      });
    });
  }

  private async guarded(ticket: number, method: string, params: JsonValue): Promise<JsonValue> {
    const down = this.unresponsive;
    if (down !== null && ticket <= down.afterTicket) {
      this.options.log.debug('miio.request_refused', {
        host: this.options.host,
        method,
      });
      throw new MiioUnreachableError(this.options.host, method, down.cause);
    }
    const attempts = down === null ? this.options.timing.requestAttempts : 1;
    try {
      const result = await this.attempt(method, params, 1, attempts);
      this.unresponsive = null;
      return result;
    } catch (error) {
      if (error instanceof MiioTimeoutError) {
        this.unresponsive = { afterTicket: this.tickets, cause: error };
      }
      throw error;
    }
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from the task result
    this.queue = result.catch(() => undefined);
    return result;
  }

  private receive(packet: Uint8Array): void {
    if (this.pending?.accept(packet) === true) {
      return;
    }
    if (packet.length > HANDSHAKE_LENGTH && this.uplinks !== null && this.deliver(packet)) {
      return;
    }
    this.options.log.debug('miio.packet_ignored', {
      host: this.options.host,
      length: packet.length,
    });
  }

  private deliver(packet: Uint8Array): boolean {
    try {
      const message = decodeMessage(this.options.token, packet);
      if (!isUplink(message.body)) {
        return false;
      }
      this.uplinks?.(message.body, message.header);
      return true;
    } catch (error) {
      this.repeat.warn('miio.uplink_refused', this.options.host, {
        host: this.options.host,
        length: packet.length,
        reason: failureLine(error),
      });
      return true;
    }
  }

  private exchange<T>(
    step: string,
    packet: Uint8Array,
    accept: (packet: Uint8Array) => T | undefined,
  ): Promise<T> {
    const { host, port, timing, socket } = this.options;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.options.log.debug('miio.exchange_timeout', {
          host,
          step,
          timeoutMs: timing.requestTimeoutMs,
        });
        reject(new MiioTimeoutError(host, step, timing.requestTimeoutMs));
      }, timing.requestTimeoutMs);
      this.pending = {
        accept: (candidate): boolean => {
          const value = accept(candidate);
          if (value === undefined) {
            return false;
          }
          clearTimeout(timer);
          this.pending = null;
          resolve(value);
          return true;
        },
      };
      const fail = (error: unknown): void => {
        clearTimeout(timer);
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try {
        socket.send(packet, port, host, (error) => {
          if (error !== null) {
            fail(error);
          }
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  private async exchangeHandshake(): Promise<Handshake> {
    const handshake = await this.exchange('the miIO handshake', helloPacket(), (packet) =>
      packet.length === HANDSHAKE_LENGTH ? parseHandshake(packet) : undefined,
    );
    this.clock = {
      deviceId: handshake.deviceId,
      stamp: handshake.stamp,
      seenAt: this.options.now(),
    };
    return handshake;
  }

  private async currentClock(): Promise<Clock> {
    const clock = this.clock;
    if (
      clock !== null &&
      this.options.now() - clock.seenAt < this.options.timing.handshakeMaxAgeMs
    ) {
      return clock;
    }
    await this.exchangeHandshake();
    return this.currentClock();
  }

  private replyTo(id: number, packet: Uint8Array): string | undefined {
    if (packet.length <= HANDSHAKE_LENGTH) {
      return undefined;
    }
    try {
      const message = decodeMessage(this.options.token, packet);
      if (responseId(message.body) !== id) {
        return undefined;
      }
      this.clock = { ...message.header, seenAt: this.options.now() };
      return message.body;
    } catch (error) {
      this.options.log.debug('miio.packet_unreadable', () => ({
        host: this.options.host,
        reason: failureLine(error),
      }));
      return undefined;
    }
  }

  private async attempt(
    method: string,
    params: JsonValue,
    attempt: number,
    attempts: number,
  ): Promise<JsonValue> {
    try {
      const clock = await this.currentClock();
      const request = { id: this.options.messageIds.next(), method, params };
      const elapsed = Math.floor((this.options.now() - clock.seenAt) / MILLISECONDS_PER_SECOND);
      const header = { deviceId: clock.deviceId, stamp: clock.stamp + elapsed + 1 };
      const packet = encodeMessage(this.options.token, header, encodeRequest(request));
      const body = await this.exchange(method, packet, (reply) => this.replyTo(request.id, reply));
      return parseResponse(request, body);
    } catch (error) {
      if (!(error instanceof MiioTimeoutError) || attempt >= attempts) {
        throw error;
      }
      this.clock = null;
      this.options.log.debug('miio.request_retried', {
        host: this.options.host,
        method,
        attempt,
        of: attempts,
        timeoutMs: this.options.timing.requestTimeoutMs,
      });
      return this.attempt(method, params, attempt + 1, attempts);
    }
  }
}
