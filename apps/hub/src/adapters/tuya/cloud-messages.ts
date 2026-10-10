import type { Logger } from '@smarteverything/logging';
import {
  CloudMessageError,
  acknowledgement,
  messageConsumerUrl,
  messagePassword,
  readMessageFrame,
  type CloudMessage,
  type MessageFrame,
} from '@smarteverything/tuya';
import type { RawData } from 'ws';
import type { MessageSocket } from './message-socket';
import type { TuyaProjectSecrets } from './account';
import type { TuyaDependencies } from './dependencies';

export interface MessageConsumerOptions {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly accessSecret: string;
  readonly pingMs: number;
  readonly reconnectDelay: (failures: number) => number;
  readonly socket: (url: string, headers: Readonly<Record<string, string>>) => MessageSocket;
  readonly log: Logger;
  readonly received: (message: CloudMessage) => void;
}

function text(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
}

export class MessageConsumer {
  private socket: MessageSocket | null = null;
  private failures = 0;
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: MessageConsumerOptions) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.close();
  }

  private open(): void {
    const socket = this.options.socket(this.options.url, this.options.headers);
    this.socket = socket;
    const current = (): boolean => this.socket === socket;
    socket.on('open', () => {
      if (current()) {
        this.failures = 0;
        this.options.log.info('tuya.messages_connected', {});
        this.pingTimer = setInterval(() => {
          socket.ping();
        }, this.options.pingMs);
      }
    });
    socket.on('message', (data) => {
      if (current()) {
        this.handle(socket, text(data));
      }
    });
    socket.on('error', (error) => {
      if (current()) {
        this.options.log.warn('tuya.messages_failed', { reason: error.message });
      }
    });
    socket.on('close', (code) => {
      if (current()) {
        this.options.log.warn('tuya.messages_closed', { code });
        this.close();
        this.retry();
      }
    });
  }

  private handle(socket: MessageSocket, frame: string): void {
    let read: MessageFrame;
    try {
      read = readMessageFrame(frame, this.options.accessSecret);
    } catch (error) {
      if (!(error instanceof CloudMessageError)) {
        throw error;
      }
      this.options.log.warn('tuya.message_unreadable', {
        reason: error.reason,
        messageId: error.messageId,
      });
      if (error.messageId !== null) {
        socket.send(acknowledgement(error.messageId));
      }
      return;
    }
    socket.send(acknowledgement(read.messageId));
    this.options.received(read.message);
  }

  private retry(): void {
    if (this.stopped || this.retryTimer !== null) {
      return;
    }
    const delayMs = this.options.reconnectDelay(this.failures);
    this.failures += 1;
    this.options.log.info('tuya.messages_reconnect_scheduled', { delayMs });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delayMs);
  }

  private close(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.terminate();
  }
}

export function messageConsumerFor(
  secrets: TuyaProjectSecrets,
  dependencies: TuyaDependencies,
  log: Logger,
  received: (message: CloudMessage) => void,
): MessageConsumer {
  return new MessageConsumer({
    url: messageConsumerUrl(secrets.region, secrets.accessId),
    headers: {
      username: secrets.accessId,
      password: messagePassword(secrets.accessId, secrets.accessSecret),
    },
    accessSecret: secrets.accessSecret,
    pingMs: dependencies.timing.messagePingMs,
    reconnectDelay: dependencies.timing.reconnectDelay,
    socket: dependencies.messageSocket,
    log,
    received,
  });
}
