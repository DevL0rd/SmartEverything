import { createCipheriv, createHash } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import type {
  AdapterFailure,
  AdapterSink,
  DeviceEvent,
  DiscoveredDevice,
  StateUpdate,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { RunContext, StoredAccount } from '../../src/adapters/contract';
import { nodeDependencies, type TuyaDependencies } from '../../src/adapters/tuya/dependencies';
import type { MqttConnect } from '../../src/adapters/tuya/mqtt-connection';
import { FakeSmartLife } from './fake-cloud';

export class RecordingSink implements AdapterSink {
  readonly states: StateUpdate[] = [];
  readonly events: DeviceEvent[] = [];
  readonly deviceLists: (readonly DiscoveredDevice[])[] = [];
  readonly failures: AdapterFailure[] = [];
  private readonly watchers = new Set<() => void>();

  readonly state = (update: StateUpdate): void => {
    this.states.push(update);
    this.notify();
  };

  readonly event = (event: DeviceEvent): void => {
    this.events.push(event);
    this.notify();
  };

  readonly devices = (devices: readonly DiscoveredDevice[]): void => {
    this.deviceLists.push(devices);
    this.notify();
  };

  readonly online = (): void => undefined;

  readonly failure = (failure: AdapterFailure): void => {
    this.failures.push(failure);
    this.notify();
  };

  latest(externalId: string): DiscoveredDevice | undefined {
    return this.deviceLists.at(-1)?.find((device) => device.externalId === externalId);
  }

  until(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
    if (condition()) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.watchers.delete(check);
        reject(new Error(`timed out waiting for ${what}`));
      }, timeoutMs);
      const check = (): void => {
        if (condition()) {
          clearTimeout(timer);
          this.watchers.delete(check);
          resolve();
        }
      };
      this.watchers.add(check);
    });
  }

  private notify(): void {
    for (const watcher of [...this.watchers]) {
      watcher();
    }
  }
}

type MqttHandlers = Parameters<MqttConnect>[1];

interface BrokerConnection {
  readonly options: Parameters<MqttConnect>[0];
  readonly handlers: MqttHandlers;
  readonly subscribed: Set<string>;
  closed: boolean;
}

export class FakeBroker {
  readonly connections: BrokerConnection[] = [];

  get live(): BrokerConnection[] {
    return this.connections.filter((connection) => !connection.closed);
  }

  readonly connect: MqttConnect = (options, handlers) => {
    const connection: BrokerConnection = {
      options,
      handlers,
      subscribed: new Set(),
      closed: false,
    };
    this.connections.push(connection);
    queueMicrotask(() => {
      if (!connection.closed) {
        handlers.connected();
      }
    });
    return {
      subscribe: (topics): void => {
        for (const topic of topics) {
          connection.subscribed.add(topic);
        }
      },
      unsubscribe: (topics): void => {
        for (const topic of topics) {
          connection.subscribed.delete(topic);
        }
      },
      close: (): void => {
        connection.closed = true;
      },
    };
  };

  publish(topic: string, body: object): void {
    for (const connection of this.live) {
      if (connection.subscribed.has(topic)) {
        connection.handlers.message(topic, JSON.stringify(body));
      }
    }
  }

  publishRaw(topic: string, payload: string): void {
    for (const connection of this.live) {
      connection.handlers.message(topic, payload);
    }
  }

  drop(): void {
    for (const connection of this.live) {
      connection.closed = true;
      connection.handlers.closed();
    }
  }
}

export interface Harness {
  readonly cloud: FakeSmartLife;
  readonly broker: FakeBroker;
  readonly dependencies: TuyaDependencies;
  readonly context: RunContext;
  readonly attention: string[];
  readonly saved: StoredAccount[];
  readonly udpSockets: Socket[];
}

export function harness(localPort: number, overrides: Partial<TuyaDependencies> = {}): Harness {
  const udpSockets: Socket[] = [];
  const attention: string[] = [];
  const saved: StoredAccount[] = [];
  const base = nodeDependencies([0, 0]);
  const now = overrides.now ?? base.now;
  const cloud = new FakeSmartLife(now);
  const broker = new FakeBroker();
  const dependencies: TuyaDependencies = {
    ...base,
    fetch: cloud.fetch,
    localPort,
    timing: {
      irLearnTimeoutMs: 2000,
      qrScanQueryMs: 20,
      qrScanTimeoutMs: 2000,
      messagingRenewMarginMs: 1000,
      inventorySettleMs: 20,
      reconnectDelay: () => 30,
    },
    udpSocket: () => {
      const socket = createSocket({ type: 'udp4' });
      udpSockets.push(socket);
      return socket;
    },
    mqtt: broker.connect,
    ...overrides,
  };
  const context: RunContext = {
    log: new Logger('tool.tuya-test'),
    dataDirectory: '/nonexistent',
    ask: () => Promise.reject(new Error('the Tuya provider never asks')),
    show: () => Promise.reject(new Error('the Tuya provider never shows a prompt')),
    saveAccount: (account) => {
      saved.push(account);
      return Promise.resolve();
    },
    needsAttention: (reason) => {
      attention.push(reason.message);
      return Promise.resolve();
    },
  };
  return { cloud, broker, dependencies, context, attention, saved, udpSockets };
}

const UDP_KEY = createHash('md5').update('yGAdlopoPVldABfn').digest();

export function announcementFrame(deviceId: string, ip: string, version = '3.3'): Buffer {
  const cipher = createCipheriv('aes-128-ecb', UDP_KEY, null);
  const json = JSON.stringify({
    ip,
    gwId: deviceId,
    active: 2,
    encrypt: true,
    productKey: 'p',
    version,
  });
  const payload = Buffer.concat([Buffer.alloc(4), cipher.update(json), cipher.final()]);
  const frame = Buffer.alloc(payload.length + 24);
  frame.writeUInt32BE(0x000055aa, 0);
  frame.writeUInt32BE(0x13, 8);
  frame.writeUInt32BE(payload.length + 8, 12);
  payload.copy(frame, 16);
  frame.writeUInt32BE(0x0000aa55, payload.length + 20);
  return frame;
}

export async function announce(sockets: readonly Socket[], frame: Buffer): Promise<void> {
  const sender = createSocket('udp4');
  for (const socket of sockets) {
    const address: AddressInfo = socket.address();
    await new Promise<void>((resolve, reject) => {
      sender.send(frame, address.port, '127.0.0.1', (error) => {
        if (error === null) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }
  sender.close();
}
