import { connect } from 'mqtt';

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

export const nodeMqttConnect: MqttConnect = (options, handlers) => {
  const client = connect(options.url, {
    clientId: options.clientId,
    username: options.username,
    password: options.password,
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 0,
  });
  client.on('connect', () => {
    handlers.connected();
  });
  client.on('message', (topic, payload) => {
    handlers.message(topic, payload.toString('utf8'));
  });
  client.on('error', (error) => {
    handlers.failed(error.message);
  });
  client.on('close', () => {
    handlers.closed();
  });
  return {
    subscribe: (topics): void => {
      client.subscribe([...topics], (error, granted) => {
        const refused = (granted ?? []).filter((grant) => grant.qos === REFUSED_QOS);
        if (error !== null || refused.length > 0) {
          handlers.failed(
            error?.message ??
              `the broker refused ${refused.map((grant) => grant.topic).join(', ')}`,
          );
        }
      });
    },
    unsubscribe: (topics): void => {
      client.unsubscribe([...topics]);
    },
    close: (): void => {
      client.end(true);
    },
  };
};
