import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { RELAY_HUB_FRAME, RELAY_NODE_FRAME, type RelayHeaders } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { RelayStreams, type RelayListener } from '../../src/computers/relay-streams';
import { NodeServerRelay } from '../../src/node/server-relay';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

function linked(): RelayStreams {
  let node: NodeServerRelay | null = null;
  const hub = new RelayStreams((frame) => {
    node?.receive(RELAY_HUB_FRAME.parse(JSON.parse(JSON.stringify(frame))));
  });
  node = new NodeServerRelay((frame) => {
    hub.receive(RELAY_NODE_FRAME.parse(JSON.parse(JSON.stringify(frame))));
  }, new Logger('hub.relay-test'));
  return hub;
}

async function listening(server: Server, host = '127.0.0.1'): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port');
  return address.port;
}

interface Collected {
  readonly status: number;
  readonly headers: RelayHeaders;
  readonly body: string;
}

function collect(): { readonly listener: RelayListener; readonly done: Promise<Collected> } {
  let status = 0;
  let headers: RelayHeaders = {};
  const chunks: Buffer[] = [];
  let finish: (value: Collected) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  const done = new Promise<Collected>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return {
    done,
    listener: {
      head: (code, values): void => {
        status = code;
        headers = values;
      },
      data: (chunk): void => {
        chunks.push(chunk);
      },
      end: (): void => {
        finish({ status, headers, body: Buffer.concat(chunks).toString() });
      },
      failed: (reason): void => {
        fail(new Error(reason));
      },
    },
  };
}

describe.each(['127.0.0.1', '::1'])('dev server relay to a server on %s', (host) => {
  it('forwards a request with its body and streams the answer back', async () => {
    const port = await listening(
      createServer((request, response) => {
        const parts: Buffer[] = [];
        request.on('data', (chunk: Buffer) => parts.push(chunk));
        request.on('end', () => {
          response.writeHead(201, { 'x-path': request.url ?? '' });
          response.end(`${request.method ?? ''}:${Buffer.concat(parts).toString()}`);
        });
      }),
      host,
    );
    const hub = linked();
    const { listener, done } = collect();
    const stream = hub.start(
      { port, method: 'POST', path: '/api?x=1', headers: { host: 'localhost' }, websocket: false },
      listener,
    );
    stream.data(Buffer.from('hello'), false);
    stream.end();
    const answer = await done;
    expect(answer.status).toBe(201);
    expect(answer.headers['x-path']).toBe('/api?x=1');
    expect(answer.body).toBe('POST:hello');
  });

  it('bridges websocket messages both ways', async () => {
    const server = createServer();
    const sockets = new WebSocketServer({ server });
    sockets.on('connection', (socket: WebSocket) => {
      socket.on('message', (data: RawData, binary: boolean) => {
        socket.send(`echo ${Buffer.isBuffer(data) ? data.toString() : ''}`, { binary });
      });
    });
    const port = await listening(server, host);
    const hub = linked();
    let opened: (status: number) => void = () => undefined;
    const open = new Promise<number>((resolve) => {
      opened = resolve;
    });
    let heard: (text: string) => void = () => undefined;
    const reply = new Promise<string>((resolve) => {
      heard = resolve;
    });
    const stream = hub.start(
      { port, method: 'GET', path: '/', headers: {}, websocket: true },
      {
        head: (status) => {
          opened(status);
        },
        data: (chunk, text) => {
          if (text) heard(chunk.toString());
        },
        end: () => undefined,
        failed: () => undefined,
      },
    );
    expect(await open).toBe(101);
    stream.data(Buffer.from('ping'), true);
    expect(await reply).toBe('echo ping');
    stream.close();
    sockets.close();
  });

  it('reports a closed port as a failure', async () => {
    const port = await listening(createServer(), host);
    await new Promise((resolve) => servers.pop()?.close(resolve));
    const { listener, done } = collect();
    linked()
      .start({ port, method: 'GET', path: '/', headers: {}, websocket: false }, listener)
      .end();
    await expect(done).rejects.toThrow(/ECONNREFUSED/u);
  });
});
