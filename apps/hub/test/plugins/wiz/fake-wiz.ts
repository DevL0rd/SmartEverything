import { createSocket, type Socket } from 'node:dgram';
import type { WizPilot } from '../../../src/plugins/builtin/wiz/protocol';
import type { DeviceDriverContext } from '../../../src/local/device-driver';
import type { PluginNetwork } from '../../../src/plugins/plugin-listen';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

export interface Received {
  readonly method: string;
  readonly id: number | undefined;
  readonly params: Readonly<Record<string, JsonValue>>;
}

const REQUEST = z.object({
  method: z.string(),
  id: z.number().optional(),
  params: z.record(z.string(), JSON_VALUE),
});
type Request = z.output<typeof REQUEST>;

export const BULB_MAC = 'a8bb50123abc';
export const COLOUR_PILOT: WizPilot = {
  mac: BULB_MAC,
  state: true,
  dimming: 60,
  r: 255,
  g: 0,
  b: 0,
  rssi: -60,
};

const CONFIGS: Readonly<Record<string, Readonly<Record<string, JsonValue>>>> = {
  getSystemConfig: { mac: BULB_MAC, fwVersion: '1.30.0', moduleName: 'ESP01_SHRGB_03' },
  getModelConfig: { mac: BULB_MAC, extRange: [2200, 6500] },
  getUserConfig: { mac: BULB_MAC },
};

function bind(socket: Socket): Promise<number> {
  return new Promise((resolve) => {
    socket.bind(0, '127.0.0.1', () => {
      resolve(socket.address().port);
    });
  });
}

export class FakeBulb {
  readonly received: Received[] = [];
  ignoring = 0;
  readonly rejecting = new Set<string>();
  private pilot = REQUEST.shape.params.parse(COLOUR_PILOT);

  private constructor(
    private readonly socket: Socket,
    readonly port: number,
  ) {}

  static async start(): Promise<FakeBulb> {
    const socket = createSocket('udp4');
    const bulb = new FakeBulb(socket, await bind(socket));
    socket.on('message', (bytes, remote) => {
      bulb.answer(bytes, remote.port);
    });
    return bulb;
  }

  push(port: number, change: Readonly<Record<string, JsonValue>>): void {
    this.pilot = { ...this.pilot, ...change };
    this.send(port, { method: 'syncPilot', params: this.pilot });
  }

  sendRaw(port: number, bytes: Buffer): void {
    this.socket.send(bytes, port, '127.0.0.1');
  }

  close(): void {
    this.socket.close();
  }

  private answer(bytes: Buffer, port: number): void {
    const request = REQUEST.parse(JSON.parse(bytes.toString('utf8')));
    this.received.push({ method: request.method, id: request.id, params: request.params });
    if (this.ignoring > 0) {
      this.ignoring -= 1;
      return;
    }
    if (this.rejecting.has(request.method)) {
      this.send(port, { method: request.method, id: request.id, error: { code: -32600 } });
      return;
    }
    this.send(port, { method: request.method, id: request.id, result: this.result(request) });
  }

  private result(request: Request): JsonValue {
    if (request.method === 'getPilot') return this.pilot;
    if (request.method === 'setPilot') {
      this.pilot = { ...this.pilot, ...request.params };
      return { mac: BULB_MAC, success: true };
    }
    if (request.method === 'registration') return { mac: BULB_MAC, success: true };
    return CONFIGS[request.method] ?? { mac: BULB_MAC };
  }

  private send(port: number, message: Readonly<Record<string, JsonValue | undefined>>): void {
    this.socket.send(Buffer.from(JSON.stringify(message)), port, '127.0.0.1');
  }
}

export class FakeNetwork implements PluginNetwork {
  readonly sockets = new Map<number, Socket>();

  async listenUdp(port: number): Promise<Socket> {
    const socket = createSocket('udp4');
    await bind(socket);
    this.sockets.set(port, socket);
    return socket;
  }

  listenTcp(): never {
    throw new Error('The WiZ plugin listens on UDP only.');
  }

  portOf(requested: number): number {
    const socket = this.sockets.get(requested);
    if (socket === undefined) throw new Error(`Nothing listens for ${String(requested)}.`);
    return socket.address().port;
  }

  close(): void {
    for (const socket of this.sockets.values()) {
      try {
        socket.close();
      } catch (cause) {
        if (!(
          cause instanceof Error &&
          'code' in cause &&
          cause.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING'
        ))
          throw cause;
      }
    }
  }
}

export interface DriverRecording {
  readonly context: DeviceDriverContext;
  readonly published: Parameters<DeviceDriverContext['publishDevices']>[0][];
  readonly states: Parameters<DeviceDriverContext['sink']['state']>[0][];
  readonly failures: Parameters<DeviceDriverContext['sink']['failure']>[0][];
}

export function recordDriver(
  signal: AbortSignal,
  publishDevices?: DeviceDriverContext['publishDevices'],
): DriverRecording {
  const published: DriverRecording['published'] = [];
  const states: DriverRecording['states'] = [];
  const failures: DriverRecording['failures'] = [];
  const context: DeviceDriverContext = {
    sink: {
      state: (update) => {
        states.push(update);
      },
      event: () => undefined,
      online: () => undefined,
      devices: () => undefined,
      failure: (failure) => {
        failures.push(failure);
      },
    },
    publishEvent: () => Promise.resolve('event'),
    publishDevices:
      publishDevices ??
      ((devices): Promise<void> => {
        published.push(devices);
        return Promise.resolve();
      }),
    signal,
    forget: () => Promise.resolve(),
  };
  return { context, published, states, failures };
}
