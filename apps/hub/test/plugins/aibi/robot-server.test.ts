import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { afterEach, describe, expect, it } from 'vitest';
import type { Routes } from '../../../src/plugins/builtin/aibi/connection';
import { ok, type Response } from '../../../src/plugins/builtin/aibi/replies';
import { SpeechStream } from '../../../src/plugins/builtin/aibi/speech-stream';
import {
  fakeCloud,
  forwardingRoutes,
  rawExchange,
  secureCloud,
  startRig,
  type FakeCloud,
  type Rig,
} from './robot-fixture';

const OK_HEAD = 'HTTP/1.1 200 OK\r\n';
const ROBOT_HEAD = 'Host: api.aibipocket.com\r\nUser-Agent: aibi\r\n';

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

function robotRequest(port: number, method: string, path: string, body?: Buffer): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, method, path }, (response) => {
      const parts: Buffer[] = [];
      response.on('data', (chunk: Buffer) => parts.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(parts).toString('utf8'),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

let cloud: FakeCloud | null = null;
let rig: Rig | null = null;
let secure: { close: () => void } | null = null;

afterEach(async () => {
  await rig?.stop();
  await cloud?.close();
  secure?.close();
  rig = null;
  cloud = null;
  secure = null;
});

async function bridge(
  answer: Parameters<typeof fakeCloud>[0],
  routes: (failures: string[]) => Routes = forwardingRoutes,
): Promise<{ cloud: FakeCloud; rig: Rig }> {
  cloud = await fakeCloud(answer);
  const { port } = cloud;
  rig = await startRig({
    routes,
    cloud: () => Promise.resolve({ httpPort: port, httpsPort: port }),
  });
  return { cloud, rig };
}

describe('AIBI robot server forwarding', () => {
  it('sends a content-length request upstream with its exact body and returns the answer', async () => {
    const { cloud: seen, rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 7\r\nContent-Type: application/json\r\n\r\n{"a":1}`);
    });
    const reply = await robotRequest(
      robot.httpPort,
      'POST',
      '/aibi/ai/imgrecog?x=1',
      Buffer.from('payload'),
    );
    expect(reply.status).toBe(200);
    expect(reply.body).toBe('{"a":1}');
    expect(seen.hits).toHaveLength(1);
    expect(seen.hits[0]?.head.split('\r\n')[0]).toBe('POST /aibi/ai/imgrecog?x=1 HTTP/1.1');
    expect(seen.hits[0]?.head).toMatch(/^content-length: 7$/im);
    expect(seen.hits[0]?.body).toBe('payload');
  });

  it('keeps the robot host header and drops its framing and connection headers upstream', async () => {
    const { cloud: seen, rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 0\r\n\r\n`);
    });
    await rawExchange(
      robot.httpPort,
      `GET /time HTTP/1.1\r\n${ROBOT_HEAD}Connection: close\r\n\r\n`,
    );
    const head = seen.hits[0]?.head ?? '';
    expect(head).toMatch(/^host: api\.aibipocket\.com$/im);
    expect(head).toMatch(/^user-agent: aibi$/im);
    expect(head).not.toMatch(/^connection: close$/im);
  });

  it('collects a chunked robot request into one upstream body', async () => {
    const { cloud: seen, rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 2\r\n\r\nok`);
    });
    const reply = await rawExchange(robot.httpPort, [
      Buffer.from(
        `POST /aibi/report/status HTTP/1.1\r\n${ROBOT_HEAD}Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\nhello\r\n`,
      ),
      Buffer.from('6\r\n world\r\n0\r\n\r\n'),
    ]);
    expect(reply).toContain('HTTP/1.1 200 OK');
    expect(seen.hits[0]?.body).toBe('hello world');
    expect(seen.hits[0]?.head).toMatch(/^content-length: 11$/im);
  });

  it('returns a chunked cloud answer to the robot as one content-length body', async () => {
    const { rig: robot } = await bridge((_hit, socket) => {
      socket.write(
        `${OK_HEAD}Transfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n4\r\n{"a"\r\n3\r\n:1}\r\n0\r\n\r\n`,
      );
    });
    const reply = await robotRequest(robot.httpPort, 'GET', '/time');
    expect(reply.body).toBe('{"a":1}');
    expect(reply.headers['content-length']).toBe('7');
    expect(reply.headers['transfer-encoding']).toBeUndefined();
    expect(reply.headers['content-type']).toBe('application/json');
  });

  it('reads a cloud answer that has no length until the cloud closes the connection', async () => {
    const { rig: robot } = await bridge((_hit, socket) => {
      socket.end(`${OK_HEAD}Content-Type: text/plain\r\nConnection: close\r\n\r\nuntil close`);
    });
    const reply = await robotRequest(robot.httpPort, 'GET', '/token/x');
    expect(reply.status).toBe(200);
    expect(reply.body).toBe('until close');
    expect(reply.headers['content-length']).toBe('11');
  });

  it('answers pipelined robot requests in the order they were sent', async () => {
    const { rig: robot } = await bridge((hit, socket) => {
      const path = hit.head.split(' ')[1] ?? '';
      const answer = `${OK_HEAD}Content-Length: ${String(path.length)}\r\n\r\n${path}`;
      setTimeout(() => socket.write(answer), path === '/one' ? 80 : 0);
    });
    const reply = await rawExchange(
      robot.httpPort,
      `GET /one HTTP/1.1\r\n${ROBOT_HEAD}\r\nGET /second HTTP/1.1\r\n${ROBOT_HEAD}Connection: close\r\n\r\n`,
    );
    expect(reply.indexOf('/one')).toBeGreaterThan(-1);
    expect(reply.indexOf('/second')).toBeGreaterThan(reply.indexOf('/one'));
  });

  it('reuses one cloud connection for requests that follow each other', async () => {
    const { cloud: seen, rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 2\r\n\r\nok`);
    });
    await robotRequest(robot.httpPort, 'GET', '/one');
    await robotRequest(robot.httpPort, 'GET', '/two');
    expect(seen.hits).toHaveLength(2);
    expect(seen.connections()).toBe(1);
  });

  it('answers 500 and reports the failure when the cloud cannot be reached', async () => {
    const { rig: robot } = await bridge(() => undefined);
    await cloud?.close();
    const reply = await robotRequest(robot.httpPort, 'GET', '/time');
    expect(reply.status).toBe(500);
    expect(reply.body).toContain('AIBI server problem');
    expect(robot.failures).toHaveLength(1);
  });

  it('turns an unreadable request into a 400 and reports it', async () => {
    const { rig: robot } = await bridge(() => undefined);
    const reply = await rawExchange(robot.httpPort, 'NOT HTTP AT ALL\r\n\r\n');
    expect(reply).toContain('HTTP/1.1 400 Bad Request');
    expect(robot.failures).toHaveLength(1);
  });
});

describe('AIBI robot server stop', () => {
  it('closes robot keep-alive connections when the server stops', async () => {
    const { rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 2\r\n\r\nok`);
    });
    const closed = await new Promise<boolean>((resolve, reject) => {
      const client = connect(robot.httpPort, '127.0.0.1');
      client.on('error', reject);
      client.on('close', () => {
        resolve(true);
      });
      client.once('data', () => {
        void robot.stop();
      });
      client.write(`GET /time HTTP/1.1\r\n${ROBOT_HEAD}\r\n`);
    });
    expect(closed).toBe(true);
  });
});

describe('AIBI robot server routes', () => {
  it('hands a detectintent body to the route while it is still arriving', async () => {
    const received: string[] = [];
    const routes = (failures: string[]): Routes => ({
      streams: (method, path) => method === 'POST' && path === '/aibi/voice/detectintent',
      stream: async (request): Promise<Response> => {
        for await (const chunk of request.chunks()) {
          received.push(chunk.toString('utf8'));
        }
        return ok({ heard: received.join('|'), index: request.query.get('index') });
      },
      handle: () => Promise.reject(new Error('not used')),
      failed: (detail) => failures.push(detail),
    });
    const { rig: robot } = await bridge(() => undefined, routes);
    const pending = rawExchange(robot.httpPort, [
      Buffer.from(
        `POST /aibi/voice/detectintent?index=3 HTTP/1.1\r\n${ROBOT_HEAD}Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\none\r\n`,
      ),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toStrictEqual(['one']);
    const second = rawExchange(robot.httpPort, [
      Buffer.from(
        `POST /aibi/voice/detectintent?index=4 HTTP/1.1\r\n${ROBOT_HEAD}Content-Length: 3\r\nConnection: close\r\n\r\ntwo`,
      ),
    ]);
    expect(await second).toContain('"index":"4"');
    pending.catch(() => undefined);
  });

  it('streams speech until the stream ends, without chunk framing, then closes', async () => {
    const speech = new SpeechStream();
    speech.writeMp3(Buffer.from('mp3-bytes'));
    speech.end();
    const routes = (failures: string[]): Routes => ({
      streams: () => false,
      stream: () => Promise.reject(new Error('not used')),
      handle: (_exchange, response): Promise<'served'> => {
        speech.serve(response);
        return Promise.resolve('served');
      },
      failed: (detail) => failures.push(detail),
    });
    const { rig: robot } = await bridge(() => undefined, routes);
    const reply = await rawExchange(
      robot.httpPort,
      `GET /tts/dl/${speech.id} HTTP/1.1\r\n${ROBOT_HEAD}\r\n`,
    );
    const [head = '', body = ''] = reply.split('\r\n\r\n');
    expect(head).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(head).toMatch(/^content-type: audio\/mpeg$/im);
    expect(head).toMatch(/^connection: close$/im);
    expect(head).not.toMatch(/transfer-encoding/i);
    expect(body.startsWith('mp3-bytes')).toBe(true);
  });

  it('keeps answering after a robot hangs up mid-request', async () => {
    const { rig: robot } = await bridge((_hit, socket) => {
      socket.write(`${OK_HEAD}Content-Length: 2\r\n\r\nok`);
    });
    await rawExchange(robot.httpPort, 'POST /x HTTP/1.1\r\nContent-Length: 50\r\n\r\npartial', 0);
    const reply = await robotRequest(robot.httpPort, 'GET', '/time');
    expect(reply.body).toBe('ok');
  });
});

describe('AIBI robot server over TLS', () => {
  it('terminates TLS from the robot and forwards to the cloud over TLS under the AIBI name', async () => {
    let cloudSide: { close: () => void } | null = null;
    rig = await startRig({
      routes: forwardingRoutes,
      cloud: async (tls) => {
        const started = await secureCloud(tls.cert, tls.key);
        cloudSide = started;
        return { httpPort: 0, httpsPort: started.port };
      },
    });
    secure = cloudSide;
    const reply = await new Promise<string>((resolve, reject) => {
      const outgoing = httpsRequest(
        {
          host: '127.0.0.1',
          port: rig?.httpsPort,
          path: '/time',
          ca: rig?.cert,
          servername: 'api.aibipocket.com',
        },
        (response) => {
          const parts: Buffer[] = [];
          response.on('data', (chunk: Buffer) => parts.push(chunk));
          response.on('end', () => {
            resolve(Buffer.concat(parts).toString('utf8'));
          });
        },
      );
      outgoing.on('error', reject);
      outgoing.end();
    });
    expect(reply).toBe('secure answer');
  });
});
