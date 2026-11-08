import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { NodeFrame, RelayHeaders, RelayHubFrame } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocket, type RawData } from 'ws';

const LOOPBACK = 'localhost';
const LOOPBACKS: LookupAddress[] = [
  { address: '127.0.0.1', family: 4 },
  { address: '::1', family: 6 },
];
const loopback: LookupFunction = (_hostname, options, callback) => {
  if (options.all === true) callback(null, LOOPBACKS);
  else callback(null, '127.0.0.1', 4);
};
const REACH = { lookup: loopback, autoSelectFamily: true } as const;

type Open = Extract<RelayHubFrame, { type: 'relay_open' }>;

interface Stream {
  readonly data: (chunk: Buffer, text: boolean) => void;
  readonly end: () => void;
  readonly close: () => void;
}

function headersOf(message: IncomingMessage): RelayHeaders {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(message.headers))
    if (value !== undefined) result[name] = value;
  return result;
}

function protocolsOf(headers: RelayHeaders): string[] {
  const value = headers['sec-websocket-protocol'];
  const joined = Array.isArray(value) ? value.join(',') : (value ?? '');
  return joined
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function socketHeaders(headers: RelayHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers))
    if (name !== 'sec-websocket-protocol')
      result[name] = Array.isArray(value) ? value.join(', ') : value;
  return result;
}

function chunkOf(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export class NodeServerRelay {
  private readonly streams = new Map<string, Stream>();

  constructor(
    private readonly send: (frame: NodeFrame) => void,
    private readonly log: Logger,
  ) {}

  receive(frame: RelayHubFrame): void {
    if (frame.type === 'relay_open') {
      this.streams.set(frame.stream, frame.websocket ? this.socket(frame) : this.http(frame));
      return;
    }
    const stream = this.streams.get(frame.stream);
    if (stream === undefined) return;
    if (frame.type === 'relay_data') stream.data(Buffer.from(frame.data, 'base64'), frame.text);
    else if (frame.type === 'relay_end') stream.end();
    else {
      this.streams.delete(frame.stream);
      stream.close();
    }
  }

  stop(): void {
    const open = [...this.streams.values()];
    this.streams.clear();
    open.forEach((stream) => {
      stream.close();
    });
  }

  private finish(stream: string, frame: NodeFrame): void {
    if (this.streams.delete(stream)) this.send(frame);
  }

  private failed(stream: string, cause: unknown): void {
    const reason =
      cause instanceof AggregateError
        ? cause.errors.map((inner: unknown) => String(inner)).join('; ')
        : cause instanceof Error
          ? cause.message
          : String(cause);
    this.log.debug('relay.failed', () => ({ reason: reason.slice(0, 300) }));
    this.finish(stream, { type: 'relay_failed', stream, reason: reason.slice(0, 4000) });
  }

  private http(open: Open): Stream {
    const { stream } = open;
    const outgoing: ClientRequest = httpRequest({
      ...REACH,
      host: LOOPBACK,
      port: open.port,
      method: open.method,
      path: open.path,
      headers: open.headers,
    });
    outgoing.on('response', (response) => {
      this.send({
        type: 'relay_head',
        stream,
        status: response.statusCode ?? 502,
        headers: headersOf(response),
      });
      response.on('data', (chunk: Buffer) => {
        if (this.streams.has(stream))
          this.send({ type: 'relay_data', stream, data: chunk.toString('base64'), text: false });
      });
      response.on('end', () => {
        this.finish(stream, { type: 'relay_end', stream });
      });
      response.on('error', (cause) => {
        this.failed(stream, cause);
      });
    });
    outgoing.on('error', (cause) => {
      this.failed(stream, cause);
    });
    return {
      data: (chunk): void => {
        outgoing.write(chunk);
      },
      end: (): void => {
        outgoing.end();
      },
      close: (): void => {
        outgoing.destroy();
      },
    };
  }

  private socket(open: Open): Stream {
    const { stream } = open;
    const socket = new WebSocket(
      `ws://${LOOPBACK}:${String(open.port)}${open.path}`,
      protocolsOf(open.headers),
      {
        ...REACH,
        headers: socketHeaders(open.headers),
      },
    );
    socket.on('upgrade', (response) => {
      this.send({ type: 'relay_head', stream, status: 101, headers: headersOf(response) });
    });
    socket.on('unexpected-response', (_request, response) => {
      this.send({
        type: 'relay_head',
        stream,
        status: response.statusCode ?? 502,
        headers: headersOf(response),
      });
      this.finish(stream, { type: 'relay_end', stream });
      socket.terminate();
    });
    socket.on('message', (data, binary) => {
      if (this.streams.has(stream))
        this.send({
          type: 'relay_data',
          stream,
          data: chunkOf(data).toString('base64'),
          text: !binary,
        });
    });
    socket.on('close', () => {
      this.finish(stream, { type: 'relay_end', stream });
    });
    socket.on('error', (cause) => {
      this.failed(stream, cause);
    });
    return {
      data: (chunk, text): void => {
        if (socket.readyState === WebSocket.OPEN) socket.send(chunk, { binary: !text });
      },
      end: (): void => {
        socket.close();
      },
      close: (): void => {
        socket.terminate();
      },
    };
  }
}
