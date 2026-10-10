import type { Logger } from '@smarteverything/logging';
import {
  CloudMessageError,
  SMART_LIFE_MESSAGING,
  SMART_LIFE_PATHS,
  deviceTopic,
  ownerTopic,
  readSmartLifeMessage,
  type CloudMessage,
  type SmartLifeMessaging,
} from '@smarteverything/tuya';
import type { MessageStream } from './backend';
import type { TuyaDependencies } from './dependencies';
import type { MqttConnection } from './mqtt-connection';
import type { SmartLifeCloud } from './smart-life-cloud';

const LINK_ID_PREFIX = 'tuya-device-sharing-sdk-python.';

export interface Subscriptions {
  readonly owners: readonly string[];
  readonly devices: ReadonlyMap<string, boolean>;
}

export interface SmartLifeMessagesOptions {
  readonly cloud: SmartLifeCloud;
  readonly dependencies: Pick<TuyaDependencies, 'mqtt' | 'requestId' | 'timing'>;
  readonly subscriptions: () => Subscriptions;
  readonly log: Logger;
  readonly received: (message: CloudMessage) => void;
}

function topicsOf(messaging: SmartLifeMessaging, subscriptions: Subscriptions): Set<string> {
  return new Set([
    ...subscriptions.owners.map((owner) => ownerTopic(messaging, owner)),
    ...[...subscriptions.devices].map(([deviceId, dataPoints]) =>
      deviceTopic(messaging, deviceId, dataPoints),
    ),
  ]);
}

export class SmartLifeMessages implements MessageStream {
  private connection: MqttConnection | null = null;
  private messaging: SmartLifeMessaging | null = null;
  private subscribed = new Set<string>();
  private failures = 0;
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SmartLifeMessagesOptions) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.disconnect();
  }

  follow(): void {
    const { connection, messaging } = this;
    if (connection === null || messaging === null) {
      return;
    }
    const wanted = topicsOf(messaging, this.options.subscriptions());
    const added = [...wanted].filter((topic) => !this.subscribed.has(topic));
    const removed = [...this.subscribed].filter((topic) => !wanted.has(topic));
    if (added.length > 0) {
      connection.subscribe(added);
    }
    if (removed.length > 0) {
      connection.unsubscribe(removed);
    }
    this.subscribed = wanted;
  }

  private async connect(): Promise<void> {
    try {
      const messaging = await this.options.cloud.call(
        'requesting Smart Life messaging credentials',
        {
          method: 'POST',
          path: SMART_LIFE_PATHS.messaging,
          body: { linkId: `${LINK_ID_PREFIX}${this.options.dependencies.requestId()}` },
        },
        SMART_LIFE_MESSAGING,
      );
      if (!this.stopped) {
        this.open(messaging);
      }
    } catch (cause) {
      this.options.log.warn('tuya.messaging_unavailable', { reason: String(cause) });
      this.retry();
    }
  }

  private open(messaging: SmartLifeMessaging): void {
    this.disconnect();
    this.messaging = messaging;
    const connection = this.options.dependencies.mqtt(
      {
        url: messaging.url,
        clientId: messaging.clientId,
        username: messaging.username,
        password: messaging.password,
      },
      this.handlers(() => this.connection === connection),
    );
    this.connection = connection;
    this.schedule(
      messaging.expireTime * 1000 - this.options.dependencies.timing.messagingRenewMarginMs,
      'renewal',
    );
  }

  private handlers(current: () => boolean): Parameters<TuyaDependencies['mqtt']>[1] {
    return {
      connected: (): void => {
        if (current()) {
          this.failures = 0;
          this.subscribed = new Set();
          this.options.log.info('tuya.messages_connected', {});
          this.follow();
        }
      },
      message: (_topic, payload): void => {
        if (current()) {
          this.deliver(payload);
        }
      },
      failed: (reason): void => {
        if (current()) {
          this.options.log.warn('tuya.messages_failed', { reason });
        }
      },
      closed: (): void => {
        if (current()) {
          this.options.log.warn('tuya.messages_closed', {});
          this.disconnect();
          this.retry();
        }
      },
    };
  }

  private deliver(payload: string): void {
    try {
      for (const message of readSmartLifeMessage(payload)) {
        this.options.received(message);
      }
    } catch (error) {
      if (!(error instanceof CloudMessageError)) {
        throw error;
      }
      this.options.log.warn('tuya.message_unreadable', { reason: error.reason });
    }
  }

  private retry(): void {
    const delayMs = this.options.dependencies.timing.reconnectDelay(this.failures);
    this.failures += 1;
    this.schedule(delayMs, 'reconnect');
  }

  private schedule(delayMs: number, reason: 'renewal' | 'reconnect'): void {
    if (this.stopped) {
      return;
    }
    this.clearTimer();
    this.options.log.info('tuya.messages_reconnect_scheduled', { delayMs, reason });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private disconnect(): void {
    const connection = this.connection;
    this.connection = null;
    this.messaging = null;
    this.subscribed = new Set();
    connection?.close();
  }
}
