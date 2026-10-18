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
import { WebSocket, WebSocketServer } from 'ws';
import type { RunContext } from '../../src/adapters/contract';
import { nodeDependencies, type TuyaDependencies } from '../../src/adapters/tuya/dependencies';
import { ACCESS_SECRET, FakeTuyaCloud } from './fake-cloud';

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

class FakeMessageServer {
  readonly acks: string[] = [];
  readonly headers: Record<string, string | string[] | undefined>[] = [];
  readonly urls: string[] = [];
  private readonly server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  private readonly clients = new Set<WebSocket>();
  private sequence = 0;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.server.once('listening', () => {
        resolve();
      });
    });
    this.server.on('connection', (socket, request) => {
      this.clients.add(socket);
      this.headers.push({ ...request.headers });
      socket.on('message', (data: Buffer) => {
        this.acks.push(data.toString('utf8'));
      });
      socket.on('close', () => this.clients.delete(socket));
    });
  }

  get port(): number {
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('the message server has no port');
    }
    return address.port;
  }

  get connected(): number {
    return this.clients.size;
  }

  socket(url: string, headers: Readonly<Record<string, string>>): WebSocket {
    this.urls.push(url);
    const parsed = new URL(url);
    return new WebSocket(`ws://127.0.0.1:${String(this.port)}${parsed.pathname}${parsed.search}`, {
      headers: { ...headers },
    });
  }

  publish(body: object): string {
    const cipher = createCipheriv('aes-128-ecb', ACCESS_SECRET.slice(8, 24), null);
    const data = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final()]).toString(
      'base64',
    );
    const payload = Buffer.from(JSON.stringify({ data, protocol: 4, pv: '2.0', t: 1 })).toString(
      'base64',
    );
    this.sequence += 1;
    const messageId = `message-${String(this.sequence)}`;
    for (const client of this.clients) {
      client.send(JSON.stringify({ messageId, payload, properties: {}, publishTime: 'now' }));
    }
    return messageId;
  }

  publishRaw(frame: string): void {
    for (const client of this.clients) {
      client.send(frame);
    }
  }

  dropClients(): void {
    for (const client of this.clients) {
      client.terminate();
    }
  }

  async close(): Promise<void> {
    this.dropClients();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}

export interface Harness {
  readonly cloud: FakeTuyaCloud;
  readonly messages: FakeMessageServer;
  readonly dependencies: TuyaDependencies;
  readonly context: RunContext;
  readonly attention: string[];
  readonly udpSockets: Socket[];
}

export function harness(localPort: number, overrides: Partial<TuyaDependencies> = {}): Harness {
  const cloud = new FakeTuyaCloud();
  const messages = new FakeMessageServer();
  const udpSockets: Socket[] = [];
  const attention: string[] = [];
  const base = nodeDependencies([0, 0]);
  const dependencies: TuyaDependencies = {
    ...base,
    fetch: cloud.fetch,
    localPort,
    timing: {
      irLearnTimeoutMs: 2000,
      cloudLearnQueryMs: 20,
      messagePingMs: 50,
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
    messageSocket: (url, headers) => messages.socket(url, headers),
    ...overrides,
  };
  const context: RunContext = {
    log: new Logger('tool.tuya-test'),
    dataDirectory: '/nonexistent',
    ask: () => Promise.reject(new Error('the Tuya provider never asks')),
    show: () => Promise.reject(new Error('the Tuya provider never shows a prompt')),
    saveAccount: () => Promise.resolve(),
    needsAttention: (reason) => {
      attention.push(reason.message);
      return Promise.resolve();
    },
  };
  return { cloud, messages, dependencies, context, attention, udpSockets };
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
