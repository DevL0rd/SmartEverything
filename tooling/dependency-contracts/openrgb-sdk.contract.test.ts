import { createServer, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { Client } from 'openrgb-sdk';
import { afterEach, describe, expect, it } from 'vitest';

const HEADER_BYTES = 16;
const PROTOCOL_VERSION = 5;
const COMMAND = {
  controllerCount: 0,
  controllerData: 1,
  protocolVersion: 40,
  setClientName: 50,
  deviceListUpdated: 100,
  profileList: 150,
  saveProfile: 151,
  loadProfile: 152,
  updateLeds: 1050,
  updateMode: 1101,
} as const;
const FLAG_BRIGHTNESS = 1 << 4;
const FLAG_PER_LED_COLOUR = 1 << 5;
const DIRECT_MODE_FLAGS = FLAG_PER_LED_COLOUR;
const STATIC_MODE_FLAGS = FLAG_BRIGHTNESS | (1 << 6);
const BRIGHTNESS_MAX = 100;
const BRIGHTNESS_NOW = 60;
const DEVICE_TYPE_LEDSTRIP = 4;

interface Request {
  readonly deviceId: number;
  readonly command: number;
  readonly body: Buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function text(value: string): Buffer {
  return Buffer.concat([u16(value.length + 1), Buffer.from(value, 'ascii'), Buffer.alloc(1)]);
}

function colour(red: number, green: number, blue: number): Buffer {
  return Buffer.from([red, green, blue, 0]);
}

function frame(deviceId: number, command: number, body: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('ORGB', 0, 'ascii');
  header.writeUInt32LE(deviceId, 4);
  header.writeUInt32LE(command, 8);
  header.writeUInt32LE(body.length, 12);
  return Buffer.concat([header, body]);
}

function mode(name: string, value: number, flags: number): Buffer {
  return Buffer.concat([
    text(name),
    u32(value),
    u32(flags),
    u32(0),
    u32(0),
    u32(0),
    u32(BRIGHTNESS_MAX),
    u32(0),
    u32(0),
    u32(0),
    u32(BRIGHTNESS_NOW),
    u32(0),
    u32(flags === DIRECT_MODE_FLAGS ? 1 : 0),
    u16(0),
  ]);
}

function zone(name: string, ledCount: number): Buffer {
  return Buffer.concat([
    text(name),
    u32(1),
    u32(ledCount),
    u32(ledCount),
    u32(ledCount),
    u16(0),
    u16(0),
    u32(0),
  ]);
}

function controllerData(): Buffer {
  const body = Buffer.concat([
    u32(DEVICE_TYPE_LEDSTRIP),
    text('Fake strip'),
    text('Fake vendor'),
    text('Fake description'),
    text('1.0'),
    text('SERIAL-1'),
    text('HID: fake'),
    u16(2),
    u32(0),
    mode('Direct', 0, DIRECT_MODE_FLAGS),
    mode('Static', 1, STATIC_MODE_FLAGS),
    u16(1),
    zone('Strip', 2),
    u16(2),
    text('LED 1'),
    u32(0),
    text('LED 2'),
    u32(1),
    u16(2),
    colour(10, 20, 30),
    colour(40, 50, 60),
    u16(0),
    u32(0),
  ]);
  return Buffer.concat([u32(body.length + 4), body]);
}

function profileList(names: readonly string[]): Buffer {
  const entries = names.map((name) =>
    Buffer.concat([u16(name.length + 1), Buffer.from(name, 'ascii'), Buffer.alloc(1)]),
  );
  return Buffer.concat([u32(0), u16(names.length), ...entries]);
}

class FakeSdkServer {
  readonly requests: Request[] = [];
  readonly sockets: Socket[] = [];
  private readonly waiters: {
    readonly command: number;
    readonly resolve: (request: Request) => void;
  }[] = [];
  private readonly server: Server;

  constructor() {
    this.server = createServer((socket) => {
      this.accept(socket);
    });
  }

  async listen(): Promise<number> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('fake OpenRGB server has no TCP address');
    }
    return address.port;
  }

  async close(): Promise<void> {
    this.server.close();
    await once(this.server, 'close');
  }

  notifyDeviceListUpdated(): void {
    this.activeSocket().write(frame(0, COMMAND.deviceListUpdated));
  }

  dropConnection(): void {
    this.activeSocket().end();
  }

  async nextRequest(command: number): Promise<Request> {
    const found = this.requests.find((request) => request.command === command);
    if (found !== undefined) return found;
    return new Promise((resolve) => {
      this.waiters.push({ command, resolve });
    });
  }

  private activeSocket(): Socket {
    const socket = this.sockets[0];
    if (socket === undefined) throw new Error('fake OpenRGB server has no client connected');
    return socket;
  }

  private release(request: Request): void {
    for (const waiter of this.waiters.filter((entry) => entry.command === request.command)) {
      waiter.resolve(request);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
    }
  }

  private accept(socket: Socket): void {
    this.sockets.push(socket);
    let pending = Buffer.alloc(0);
    socket.on('error', () => undefined);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= HEADER_BYTES) {
        const length = pending.readUInt32LE(12);
        if (pending.length < HEADER_BYTES + length) return;
        const request: Request = {
          deviceId: pending.readUInt32LE(4),
          command: pending.readUInt32LE(8),
          body: pending.subarray(HEADER_BYTES, HEADER_BYTES + length),
        };
        pending = pending.subarray(HEADER_BYTES + length);
        this.requests.push(request);
        this.release(request);
        this.answer(socket, request);
      }
    });
  }

  private answer(socket: Socket, request: Request): void {
    switch (request.command) {
      case COMMAND.protocolVersion:
        socket.write(frame(0, COMMAND.protocolVersion, u32(PROTOCOL_VERSION)));
        return;
      case COMMAND.controllerCount:
        socket.write(frame(0, COMMAND.controllerCount, u32(1)));
        return;
      case COMMAND.controllerData:
        socket.write(frame(request.deviceId, COMMAND.controllerData, controllerData()));
        return;
      case COMMAND.profileList:
        socket.write(frame(0, COMMAND.profileList, profileList(['Evening', 'Gaming'])));
        return;
      default:
        return;
    }
  }
}

const servers: FakeSdkServer[] = [];
const clients: Client[] = [];

async function connectedClient(): Promise<{
  readonly client: Client;
  readonly server: FakeSdkServer;
}> {
  const server = new FakeSdkServer();
  servers.push(server);
  const port = await server.listen();
  const client = new Client('contract', port, '127.0.0.1');
  clients.push(client);
  await client.connect();
  return { client, server };
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const server of servers.splice(0)) await server.close();
});

describe('openrgb-sdk contract', () => {
  it('negotiates the protocol version and announces the client name', async () => {
    const { client, server } = await connectedClient();
    expect(client.protocolVersion).toBe(PROTOCOL_VERSION);
    const announced = await server.nextRequest(COMMAND.setClientName);
    expect(announced.body.toString('ascii')).toBe('contract\0');
  });

  it('reads the device list with modes, zones, LEDs and colours', async () => {
    const { client } = await connectedClient();
    const devices = await client.getAllControllerData();
    expect(
      devices.map((device) => ({
        name: device.name,
        serial: device.serial,
        type: device.type,
        modes: device.modes.map((entry) => entry.name),
        brightnessMax: device.modes[1]?.brightnessMax,
        brightnessFlag: device.modes[1]?.flagList.includes('brightness'),
        zones: device.zones.map((entry) => [entry.name, entry.ledsCount]),
        leds: device.leds.map((entry) => entry.name),
        colors: device.colors,
      })),
    ).toEqual([
      {
        name: 'Fake strip',
        serial: 'SERIAL-1',
        type: DEVICE_TYPE_LEDSTRIP,
        modes: ['Direct', 'Static'],
        brightnessMax: BRIGHTNESS_MAX,
        brightnessFlag: true,
        zones: [['Strip', 2]],
        leds: ['LED 1', 'LED 2'],
        colors: [
          { red: 10, green: 20, blue: 30 },
          { red: 40, green: 50, blue: 60 },
        ],
      },
    ]);
  });

  it('writes every LED of a device in one update-LEDs request', async () => {
    const { client, server } = await connectedClient();
    client.updateLeds(0, [
      { red: 1, green: 2, blue: 3 },
      { red: 4, green: 5, blue: 6 },
    ]);
    const request = await server.nextRequest(COMMAND.updateLeds);
    expect(request.deviceId).toBe(0);
    expect(request.body.readUInt32LE(0)).toBe(request.body.length);
    expect(request.body.readUInt16LE(4)).toBe(2);
    expect([...request.body.subarray(6, 14)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
  });

  it('switches a device to a mode chosen by name', async () => {
    const { client, server } = await connectedClient();
    await client.updateMode(0, { name: 'static', brightness: 30 });
    const request = await server.nextRequest(COMMAND.updateMode);
    expect(request.body.readUInt32LE(0)).toBe(request.body.length);
    expect(request.body.readUInt32LE(4)).toBe(1);
  });

  it('lists, saves and loads profiles', async () => {
    const { client, server } = await connectedClient();
    expect(await client.getProfileList()).toEqual(['Evening', 'Gaming']);
    client.saveProfile('Night');
    client.loadProfile('Evening');
    expect((await server.nextRequest(COMMAND.saveProfile)).body.toString('ascii')).toBe('Night\0');
    expect((await server.nextRequest(COMMAND.loadProfile)).body.toString('ascii')).toBe(
      'Evening\0',
    );
  });

  it('emits device-list-updated when the server announces a change while no request is waiting', async () => {
    const { client, server } = await connectedClient();
    const updated = once(client, 'deviceListUpdated');
    server.notifyDeviceListUpdated();
    await updated;
  });

  it('emits device-list-updated once per announcement and still answers requests sent after it', async () => {
    const { client, server } = await connectedClient();
    let announcements = 0;
    client.on('deviceListUpdated', () => {
      announcements += 1;
    });
    server.notifyDeviceListUpdated();
    server.notifyDeviceListUpdated();
    expect(await client.getControllerCount()).toBe(1);
    expect(announcements).toBe(2);
  });

  it('emits disconnect when the server drops the connection', async () => {
    const { client, server } = await connectedClient();
    const closed = once(client, 'disconnect');
    server.dropConnection();
    await closed;
    expect(client.isConnected).toBe(false);
  });
});
