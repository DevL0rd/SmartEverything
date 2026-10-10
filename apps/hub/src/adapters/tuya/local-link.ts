import type { Logger } from '@smarteverything/logging';
import { classifyLocalPayload, isKeyMismatchError } from '@smarteverything/tuya';
import type { LocalClient, LocalClientOptions, LocalValue } from './local-client';

const STATUS_PUSH = 8;

export interface LinkTarget {
  readonly deviceId: string;
  readonly key: string;
  readonly ip: string;
  readonly version: string;
}

interface LinkHandlers {
  readonly report: (
    cid: string | null,
    dps: Readonly<Record<string, unknown>>,
    pushed: boolean,
  ) => void;
  readonly connected: () => void;
  readonly disconnected: () => void;
  readonly keyMismatch: () => void;
}

export interface LinkOptions {
  readonly client: (options: LocalClientOptions) => LocalClient;
  readonly port: number;
  readonly reconnectDelay: (failures: number) => number;
  readonly log: Logger;
  readonly handlers: LinkHandlers;
}

export class LocalLinkUnavailableError extends Error {
  override readonly name = 'LocalLinkUnavailableError';

  constructor(readonly deviceId: string) {
    super(
      `The local connection to Tuya device ${deviceId} is not open right now; it reconnects on its own.`,
    );
  }
}

class LocalQueryError extends Error {
  override readonly name = 'LocalQueryError';

  constructor(
    readonly deviceId: string,
    readonly received: string,
  ) {
    super(`Tuya device ${deviceId} answered a status query without data points: ${received}.`);
  }
}

export class LocalKeyRejectedError extends Error {
  override readonly name = 'LocalKeyRejectedError';

  constructor(readonly deviceId: string) {
    super(
      `Tuya device ${deviceId} refuses the local key the cloud holds for it, so it is controlled through the cloud until the key changes.`,
    );
  }
}

export function describeLocalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sameTarget(left: LinkTarget, right: LinkTarget): boolean {
  return left.key === right.key && left.ip === right.ip && left.version === right.version;
}

export class LocalLink {
  private client: LocalClient | null = null;
  private connected = false;
  private failures = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private target: LinkTarget,
    private readonly options: LinkOptions,
  ) {}

  get current(): LinkTarget {
    return this.target;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  replace(target: LinkTarget): void {
    this.target = target;
    this.failures = 0;
    this.clearTimer();
    this.close();
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.close();
  }

  async write(cid: string | null, data: Record<string, LocalValue>): Promise<void> {
    const client = this.openClient();
    await client.set({
      multiple: true,
      data,
      shouldWaitForResponse: false,
      ...(cid === null ? {} : { cid }),
    });
  }

  async query(cid: string | null): Promise<Readonly<Record<string, unknown>>> {
    const client = this.openClient();
    const payload = classifyLocalPayload(
      await client.get({ schema: true, ...(cid === null ? {} : { cid }) }),
    );
    if (payload.kind !== 'dps') {
      throw new LocalQueryError(this.target.deviceId, payload.kind);
    }
    return payload.dps;
  }

  private openClient(): LocalClient {
    if (this.client === null || !this.connected) {
      throw new LocalLinkUnavailableError(this.target.deviceId);
    }
    return this.client;
  }

  private open(): void {
    const client = this.options.client({
      id: this.target.deviceId,
      key: this.target.key,
      ip: this.target.ip,
      port: this.options.port,
      version: this.target.version,
    });
    this.client = client;
    const current = (): boolean => this.client === client;
    client.on('connected', () => {
      if (current()) {
        this.onConnected();
      }
    });
    client.on('disconnected', () => {
      if (current()) {
        this.onDisconnected();
      }
    });
    client.on('error', (error) => {
      if (current()) {
        this.onError(error);
      }
    });
    client.on('data', (payload, commandByte) => {
      if (current()) {
        this.onPayload(payload, commandByte === STATUS_PUSH);
      }
    });
    client.on('dp-refresh', (payload) => {
      if (current()) {
        this.onPayload(payload, true);
      }
    });
    client.connect().catch((cause: unknown) => {
      if (current()) {
        this.options.log.warn('tuya.local_connect_failed', {
          deviceId: this.target.deviceId,
          ip: this.target.ip,
          reason: describeLocalError(cause),
        });
        this.retry();
      }
    });
  }

  private onConnected(): void {
    this.failures = 0;
    this.connected = true;
    this.options.log.info('tuya.local_connected', {
      deviceId: this.target.deviceId,
      ip: this.target.ip,
      version: this.target.version,
    });
    this.options.handlers.connected();
  }

  private onDisconnected(): void {
    this.connected = false;
    this.options.log.warn('tuya.local_disconnected', { deviceId: this.target.deviceId });
    this.options.handlers.disconnected();
    this.retry();
  }

  private onError(error: unknown): void {
    const reason = describeLocalError(error);
    if (isKeyMismatchError(reason)) {
      this.options.handlers.keyMismatch();
      return;
    }
    this.options.log.debug('tuya.local_error', { deviceId: this.target.deviceId, reason });
  }

  private onPayload(payload: unknown, pushed: boolean): void {
    const classified = classifyLocalPayload(payload);
    switch (classified.kind) {
      case 'dps':
        this.options.handlers.report(classified.cid, classified.dps, pushed);
        return;
      case 'key_mismatch':
        this.options.handlers.keyMismatch();
        return;
      case 'device_message':
        this.options.log.debug('tuya.local_message', {
          deviceId: this.target.deviceId,
          text: classified.text,
        });
        return;
      case 'empty':
        return;
    }
  }

  private retry(): void {
    if (this.stopped || this.timer !== null) {
      return;
    }
    const delayMs = this.options.reconnectDelay(this.failures);
    this.failures += 1;
    this.options.log.info('tuya.local_reconnect_scheduled', {
      deviceId: this.target.deviceId,
      delayMs,
    });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.close();
      this.open();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private close(): void {
    const client = this.client;
    this.client = null;
    this.connected = false;
    client?.disconnect();
  }
}
