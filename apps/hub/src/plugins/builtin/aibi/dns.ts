import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import type { Server, Socket } from 'node:net';
import type { PluginNetwork } from '../../plugin-listen';
import { localAnswer, serverFailure } from './dns-message';

const UPSTREAM_TIMEOUT_MS = 2500;

const ANNOUNCE_GAP_MS = 15_000;
const LENGTH_PREFIX_BYTES = 2;
const DEFAULT_UPSTREAM_PORT = 53;

class DnsUpstreamTimeoutError extends Error {
  override readonly name = 'DnsUpstreamTimeoutError';

  constructor(readonly upstream: string) {
    super(`DNS upstream ${upstream} timed out`);
  }
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

function forward(message: Buffer, upstream: string): Promise<Buffer> {
  const [host = '1.1.1.1', port = String(DEFAULT_UPSTREAM_PORT)] = upstream.split(':');
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      socket.close();
      settle();
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
  });
}

export class DnsServer {
  private udp: UdpSocket | null = null;
  private tcp: Server | null = null;
  private readonly clients = new Set<Socket>();
  private readonly lastAnswer = new Map<string, number>();

  constructor(
    private readonly options: DnsOptions,
    private readonly events: DnsEvents,
  ) {}

  async start(): Promise<void> {
    const { network, port, address } = this.options;
    const udp = await network.listenUdp(port, address);
    udp.on('message', (message, remote) => {
      void this.reply(message, remote.address).then((answer) => {
        if (answer !== null) {
          udp.send(answer, remote.port, remote.address);
        }
      });
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
      this.events.warning(
        'DNS over TCP did not start; AIBI uses UDP',
        error instanceof Error ? error.message : String(error),
      );
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
        return await forward(message, this.options.upstream);
      }
      this.noteAnswer(remote);
      return local;
    } catch (error) {
      this.events.warning(
        'DNS query failed',
        error instanceof Error ? error.message : String(error),
      );
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
        void this.reply(message, client.remoteAddress ?? '').then((answer) => {
          if (answer !== null && !client.destroyed) {
            const prefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
            prefix.writeUInt16BE(answer.length, 0);
            client.write(Buffer.concat([prefix, answer]));
          }
        });
      }
    });
  }
}
