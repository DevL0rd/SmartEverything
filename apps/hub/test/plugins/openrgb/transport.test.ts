import { once } from 'node:events';
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenRgbConnectionClosedError,
  connectOpenRgb,
  type OpenRgbLink,
} from '../../../src/plugins/builtin/openrgb/transport';
import { testLogger } from '../../support/logs';

const HEADER_BYTES = 16;
const PROTOCOL_VERSION = 5;
const PROTOCOL_VERSION_COMMAND = 40;
const CONTROLLER_COUNT_COMMAND = 0;
const DEVICE_LIST_UPDATED_COMMAND = 100;

function frame(command: number, body: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('ORGB', 0, 'ascii');
  header.writeUInt32LE(command, 8);
  header.writeUInt32LE(body.length, 12);
  return Buffer.concat([header, body]);
}

function word(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

class EmptyServer {
  readonly sockets: Socket[] = [];
  private readonly server: Server;

  constructor(private readonly answersCount: boolean) {
    this.server = createServer((socket) => {
      this.sockets.push(socket);
      socket.on('error', () => undefined);
      socket.on('data', (chunk: Buffer) => {
        this.answer(socket, chunk.readUInt32LE(8));
      });
    });
  }

  async listen(): Promise<number> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('No TCP address.');
    return address.port;
  }

  async close(): Promise<void> {
    this.server.close();
    await once(this.server, 'close');
  }

  announce(): void {
    this.sockets[0]?.write(frame(DEVICE_LIST_UPDATED_COMMAND));
  }

  hangUp(): void {
    this.sockets[0]?.end();
  }

  private answer(socket: Socket, command: number): void {
    if (command === PROTOCOL_VERSION_COMMAND) {
      socket.write(frame(command, word(PROTOCOL_VERSION)));
    } else if (command === CONTROLLER_COUNT_COMMAND && this.answersCount) {
      socket.write(frame(command, word(0)));
    }
  }
}

const servers: EmptyServer[] = [];
const links: OpenRgbLink[] = [];

async function connected(
  answersCount: boolean,
): Promise<{ link: OpenRgbLink; server: EmptyServer }> {
  const server = new EmptyServer(answersCount);
  servers.push(server);
  const port = await server.listen();
  const link = await connectOpenRgb({ host: '127.0.0.1', port }, testLogger('openrgb'));
  links.push(link);
  return { link, server };
}

afterEach(async () => {
  for (const link of links.splice(0)) link.close();
  for (const server of servers.splice(0)) await server.close();
});

describe('OpenRGB transport', () => {
  it('reads the device list of a server', async () => {
    const { link } = await connected(true);
    expect(await link.controllers()).toEqual([]);
  });

  it('tells its listener when the server announces a device change although no request is waiting', async () => {
    const { link, server } = await connected(true);
    const announced = new Promise<void>((resolve) => {
      link.onListUpdated(resolve);
    });
    server.announce();
    await announced;
  });

  it('fails a read that was waiting for an answer when the server hangs up', async () => {
    const { link, server } = await connected(false);
    const reading = link.controllers();
    server.hangUp();
    await expect(reading).rejects.toBeInstanceOf(OpenRgbConnectionClosedError);
  });

  it('tells a late listener that the connection is already closed', async () => {
    const { link, server } = await connected(true);
    const closed = new Promise<void>((resolve) => {
      link.onClosed(resolve);
    });
    server.hangUp();
    await closed;
    await new Promise<void>((resolve) => {
      link.onClosed(resolve);
    });
  });

  it('reports a server that is not running', async () => {
    const server = new EmptyServer(true);
    const port = await server.listen();
    await server.close();
    await expect(
      connectOpenRgb({ host: '127.0.0.1', port }, testLogger('openrgb')),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
