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
import type { XiaomiTiming } from './dependencies';

const HANDSHAKE_LENGTH = 32;
const MAX_PACKET_LENGTH = 4096;
const MILLISECONDS_PER_SECOND = 1000;

export class MiioTimeoutError extends Error {
  override readonly name = 'MiioTimeoutError';

  constructor(
    readonly host: string,
    readonly step: string,
    readonly timeoutMs: number,
  ) {
    super(`The device at ${host} did not answer ${step} within ${String(timeoutMs)} ms.`);
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
  private messageId = 0;
  private uplinks: UplinkListener | null = null;

  constructor(private readonly options: MiioClientOptions) {
    options.socket.on('error', (error) => {
      options.log.warn('miio.socket_failed', { host: options.host, reason: String(error) });
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
    return this.serialized(() => this.exchangeHandshake());
  }

  async call(method: string, params: JsonValue): Promise<JsonValue> {
    return this.serialized(() => this.attempt(method, params, 1));
  }

  async probe(virtualDid: bigint): Promise<ProbeReply> {
    return this.serialized(async () => {
      const reply = await this.exchange('the push probe', probePacket(virtualDid), (packet) =>
        packet.length === HANDSHAKE_LENGTH ? parseProbeReply(packet) : undefined,
      );
      this.clock = { deviceId: reply.deviceId, stamp: reply.stamp, seenAt: this.options.now() };
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
        log.warn('miio.answer_failed', { host, reason: String(error) });
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

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
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
      this.options.log.warn('miio.uplink_refused', {
        host: this.options.host,
        reason: String(error),
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
      this.options.log.debug('miio.packet_unreadable', {
        host: this.options.host,
        reason: String(error),
      });
      return undefined;
    }
  }

  private async attempt(method: string, params: JsonValue, attempt: number): Promise<JsonValue> {
    try {
      const clock = await this.currentClock();
      this.messageId = nextMessageId(this.messageId);
      const request = { id: this.messageId, method, params };
      const elapsed = Math.floor((this.options.now() - clock.seenAt) / MILLISECONDS_PER_SECOND);
      const header = { deviceId: clock.deviceId, stamp: clock.stamp + elapsed + 1 };
      const packet = encodeMessage(this.options.token, header, encodeRequest(request));
      const body = await this.exchange(method, packet, (reply) => this.replyTo(request.id, reply));
      return parseResponse(request, body);
    } catch (error) {
      if (!(error instanceof MiioTimeoutError) || attempt >= this.options.timing.requestAttempts) {
        throw error;
      }
      this.clock = null;
      this.options.log.debug('miio.request_retried', { host: this.options.host, method, attempt });
      return this.attempt(method, params, attempt + 1);
    }
  }
}
