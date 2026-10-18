import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import type { Server, Socket } from 'node:net';
import type { PluginNetwork } from '../../plugin-listen';
import {
  AUTHORITATIVE_ANSWER,
  decode,
  encode,
  RECURSION_AVAILABLE,
  RECURSION_DESIRED,
  type DecodedPacket,
  type Question,
} from 'dns-packet';
import { AIBI_HOST } from './host-name';
import { background, messageOf } from '@smarteverything/logging';

const UPSTREAM_TIMEOUT_MS = 2500;
const ANSWER_TTL_SECONDS = 30;
const SERVER_FAILURE = 2;

const ANNOUNCE_GAP_MS = 15_000;
const LENGTH_PREFIX_BYTES = 2;
const DEFAULT_UPSTREAM_PORT = 53;

class DnsListenerStoppedError extends Error {
  override readonly name = 'DnsListenerStoppedError';
  constructor() {
    super('DNS listener stopped');
  }
}

class DnsUpstreamTimeoutError extends Error {
  override readonly name = 'DnsUpstreamTimeoutError';

  constructor(readonly upstream: string) {
    super(`DNS upstream ${upstream} timed out`);
  }
}

function queryOf(message: Buffer): DecodedPacket | null {
  try {
    return decode(message);
  } catch (cause) {
    if (cause instanceof Error) {
      return null;
    }
    throw cause;
  }
}

function ownQuestion(query: DecodedPacket): Question | null {
  const asked = query.questions?.[0];
  const name = asked?.name.toLowerCase() ?? '';
  return asked !== undefined && (name === AIBI_HOST || name.endsWith(`.${AIBI_HOST}`))
    ? asked
    : null;
}

export function localAnswer(message: Buffer, address: string): Buffer | null {
  const query = queryOf(message);
  const asked = query === null ? null : ownQuestion(query);
  if (query === null || asked === null) {
    return null;
  }
  const wanted = asked.type === 'A' && asked.class === 'IN';
  return encode({
    type: 'response',
    id: query.id ?? 0,
    flags: AUTHORITATIVE_ANSWER | RECURSION_AVAILABLE | ((query.flags ?? 0) & RECURSION_DESIRED),
    questions: [asked],
    answers: wanted
      ? [{ type: 'A', name: asked.name, class: 'IN', ttl: ANSWER_TTL_SECONDS, data: address }]
      : [],
  });
}

export function serverFailure(message: Buffer): Buffer | null {
  const query = queryOf(message);
  return query === null
    ? null
    : encode({
        type: 'response',
        id: query.id ?? 0,
        flags: RECURSION_AVAILABLE | SERVER_FAILURE | ((query.flags ?? 0) & RECURSION_DESIRED),
        questions: query.questions ?? [],
      });
}

export interface DnsOptions {
  readonly address: string;
  readonly port: number;
  readonly upstream: string;
  readonly network: Pick<PluginNetwork, 'listenTcp' | 'listenUdp'>;
}

export interface DnsEvents {
  readonly answered: (remote: string) => void;
  readonly warning: (title: string, detail: string) => void;
}

function forward(message: Buffer, upstream: string, signal: AbortSignal): Promise<Buffer> {
  const [host = '1.1.1.1', port = String(DEFAULT_UPSTREAM_PORT)] = upstream.split(':');
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DnsListenerStoppedError());
      return;
    }
    const socket = createSocket('udp4');
    let finished = false;
    const finish = (settle: () => void): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      socket.close();
      settle();
    };
    const aborted = (): void => {
      finish(() => {
        reject(new DnsListenerStoppedError());
      });
    };
    const timer = setTimeout(() => {
      finish(() => {
        reject(new DnsUpstreamTimeoutError(upstream));
      });
    }, UPSTREAM_TIMEOUT_MS);
    socket.once('message', (response) => {
      finish(() => {
        resolve(response);
      });
    });
    socket.once('error', (error) => {
      finish(() => {
        reject(error);
      });
    });
    socket.send(message, Number(port), host);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export class DnsServer {
  private udp: UdpSocket | null = null;
  private tcp: Server | null = null;
  private readonly clients = new Set<Socket>();
  private readonly lastAnswer = new Map<string, number>();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly options: DnsOptions,
    private readonly events: DnsEvents,
  ) {}

  async start(): Promise<void> {
    const { network, port, address } = this.options;
    const udp = await network.listenUdp(port, address);
    if (this.lifetime.signal.aborted) {
      udp.close();
      return;
    }
    udp.on('message', (message, remote) => {
      background(
        this.reply(message, remote.address).then((answer) => {
          if (answer !== null && this.udp === udp && !this.lifetime.signal.aborted) {
            udp.send(answer, remote.port, remote.address);
          }
        }),
        'dns.reply_failed',
      );
    });
    udp.on('error', (error) => {
      this.events.warning('DNS server error', error.message);
    });
    this.udp = udp;
    await this.startTcp();
  }

  private async startTcp(): Promise<void> {
    const { network, port, address } = this.options;
    let tcp: Server;
    try {
      tcp = await network.listenTcp(port, address);
    } catch (error) {
      this.events.warning('DNS over TCP did not start; AIBI uses UDP', messageOf(error));
      return;
    }
    if (this.lifetime.signal.aborted) {
      tcp.close();
      return;
    }
    tcp.on('connection', (client) => {
      this.stream(client);
    });
    tcp.on('error', (error) => {
      this.events.warning('DNS TCP server error', error.message);
    });
    this.tcp = tcp;
  }

  stop(): void {
    this.lifetime.abort();
    this.clients.forEach((client) => {
      client.destroy();
    });
    this.clients.clear();
    this.tcp?.close();
    this.udp?.close();
    this.tcp = null;
    this.udp = null;
  }

  private async reply(message: Buffer, remote: string): Promise<Buffer | null> {
    try {
      const local = localAnswer(message, this.options.address);
      if (local === null) {
        return await forward(message, this.options.upstream, this.lifetime.signal);
      }
      this.noteAnswer(remote);
      return local;
    } catch (error) {
      if (this.lifetime.signal.aborted) return null;
      this.events.warning('DNS query failed', messageOf(error));
      return serverFailure(message);
    }
  }

  private noteAnswer(remote: string): void {
    const now = Date.now();
    if (now - (this.lastAnswer.get(remote) ?? 0) < ANNOUNCE_GAP_MS) {
      return;
    }
    this.lastAnswer.set(remote, now);
    this.events.answered(remote);
  }

  private stream(client: Socket): void {
    this.clients.add(client);
    let buffer = Buffer.alloc(0);
    client.on('error', () => {
      client.destroy();
    });
    client.on('close', () => {
      this.clients.delete(client);
    });
    client.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= LENGTH_PREFIX_BYTES) {
        const size = buffer.readUInt16BE(0);
        if (buffer.length < size + LENGTH_PREFIX_BYTES) {
          return;
        }
        const message = buffer.subarray(LENGTH_PREFIX_BYTES, size + LENGTH_PREFIX_BYTES);
        buffer = buffer.subarray(size + LENGTH_PREFIX_BYTES);
        background(
          this.reply(message, client.remoteAddress ?? '').then((answer) => {
            if (answer !== null && !client.destroyed) {
              const prefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
              prefix.writeUInt16BE(answer.length, 0);
              client.write(Buffer.concat([prefix, answer]));
            }
          }),
          'dns.reply_failed',
        );
      }
    });
  }
}
