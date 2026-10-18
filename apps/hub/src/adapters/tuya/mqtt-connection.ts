import { Logger } from '@smarteverything/logging';
import { createHash } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import { CountSummary } from '../../providers/count-summary';

interface MqttOptions {
  readonly url: string;
  readonly clientId: string;
  readonly username: string;
  readonly password: string;
}

interface MqttHandlers {
  readonly connected: () => void;
  readonly message: (topic: string, payload: string) => void;
  readonly closed: () => void;
  readonly failed: (reason: string) => void;
}

export interface MqttConnection {
  subscribe(topics: readonly string[]): void;
  unsubscribe(topics: readonly string[]): void;
  close(): void;
}

export type MqttConnect = (options: MqttOptions, handlers: MqttHandlers) => MqttConnection;

const REFUSED_QOS = 128;

const log = new Logger('hub.tuya');

function watch(client: MqttClient, handlers: MqttHandlers, link: string): void {
  const openedAt = Date.now();
  const messages = new CountSummary(log, 'tuya_mqtt.messages_summary', { context: { link } });
  client.on('connect', () => {
    log.info('tuya_mqtt.connected', { link, afterMs: Date.now() - openedAt });
    handlers.connected();
  });
  client.on('message', (topic, payload) => {
    messages.count('received');
    messages.count('bytes', payload.byteLength);
    handlers.message(topic, payload.toString('utf8'));
  });
  client.on('error', (error) => {
    log.warn('tuya_mqtt.error', {
      link,
      reason: `${error.name}: ${error.message}`,
      livedMs: Date.now() - openedAt,
    });
    handlers.failed(error.message);
  });
  client.on('close', () => {
    log.info('tuya_mqtt.closed', { link, livedMs: Date.now() - openedAt });
    handlers.closed();
  });
}

export const nodeMqttConnect: MqttConnect = (options, handlers) => {
  const link = createHash('sha256').update(options.clientId).digest('hex').slice(0, 8);
  log.info('tuya_mqtt.connecting', { link });
  const client = connect(options.url, {
    clientId: options.clientId,
    username: options.username,
    password: options.password,
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 0,
  });
  watch(client, handlers, link);
  return {
    subscribe: (topics): void => {
      client.subscribe([...topics], (error, granted) => {
        const refused = (granted ?? []).filter((grant) => grant.qos === REFUSED_QOS);
        log.debug('tuya_mqtt.subscribed', {
          link,
          topics: topics.length,
          granted: granted?.length ?? 0,
          refused: refused.length,
          failed: error !== null,
        });
        if (error !== null || refused.length > 0) {
          handlers.failed(
            error?.message ??
              `the broker refused ${refused.map((grant) => grant.topic).join(', ')}`,
          );
        }
      });
    },
    unsubscribe: (topics): void => {
      log.debug('tuya_mqtt.unsubscribing', { link, topics: topics.length });
      client.unsubscribe([...topics]);
    },
    close: (): void => {
      log.info('tuya_mqtt.closing', { link });
      client.end(true);
    },
  };
};
