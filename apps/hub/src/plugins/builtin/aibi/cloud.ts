import { Resolver } from 'node:dns/promises';
import { connect as connectPlain, type Socket } from 'node:net';
import { connect as connectSecure } from 'node:tls';
import { AIBI_HOST } from './host-name';
import { collector, HttpReader, rebuild, type Message } from './http-reader';

export type Scheme = 'http' | 'https';

export interface Cloud {
  readonly address: () => Promise<string>;
  readonly httpPort: number;
  readonly httpsPort: number;
  readonly ca?: string;
}

const RESOLVE_TIMEOUT_MS = 3000;
const RESOLVE_TRIES = 2;
const CLOUD_HTTP_PORT = 80;
const CLOUD_HTTPS_PORT = 443;

class CloudAddressMissingError extends Error {
  override readonly name = 'CloudAddressMissingError';

  constructor(readonly dnsServer: string) {
    super(`${dnsServer} did not return an address for ${AIBI_HOST}`);
  }
}

class CloudClosedError extends Error {
  override readonly name = 'CloudClosedError';

  constructor() {
    super('The AIBI cloud closed the connection');
  }
}

export function cloudVia(dnsServer: string): Cloud {
  const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT_MS, tries: RESOLVE_TRIES });
  resolver.setServers([dnsServer]);
  return {
    address: async (): Promise<string> => {
      const [found] = await resolver.resolve4(AIBI_HOST);
      if (found === undefined) {
        throw new CloudAddressMissingError(dnsServer);
      }
      return found;
    },
    httpPort: CLOUD_HTTP_PORT,
    httpsPort: CLOUD_HTTPS_PORT,
  };
}

interface Waiter {
  readonly resolve: (message: Message) => void;
  readonly reject: (error: Error) => void;
}

export class Upstream {
  private socket: Promise<Socket> | null = null;
  private waiting: Waiter[] = [];

  constructor(
    private readonly scheme: Scheme,
    private readonly target: Cloud,
  ) {}

  async send(message: Message): Promise<Message> {
    const socket = await this.connected();
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      socket.write(rebuild(message));
    });
  }

  close(): void {
    void this.socket?.then(
      (socket) => {
        socket.destroy();
      },
      (error: unknown) => {
        this.fail(error instanceof Error ? error : new CloudClosedError());
      },
    );
  }

  private connected(): Promise<Socket> {
    this.socket ??= this.open().catch((error: unknown) => {
      this.socket = null;
      throw error instanceof Error ? error : new CloudClosedError();
    });
    return this.socket;
  }

  private async open(): Promise<Socket> {
    const host = await this.target.address();
    const reader = new HttpReader(
      collector((message) => {
        this.waiting.shift()?.resolve(message);
      }),
      true,
    );
    const socket =
      this.scheme === 'https'
        ? connectSecure({
            host,
            port: this.target.httpsPort,
            servername: AIBI_HOST,
            minVersion: 'TLSv1.2',
            ...(this.target.ca === undefined ? {} : { ca: this.target.ca }),
          })
        : connectPlain({ host, port: this.target.httpPort });
    socket.on('data', (chunk: Buffer) => {
      try {
        reader.push(chunk);
      } catch (error) {
        this.fail(error instanceof Error ? error : new CloudClosedError());
        socket.destroy();
      }
    });
    socket.on('end', () => {
      reader.close();
    });
    socket.on('error', (error: Error) => {
      this.fail(error);
    });
    socket.on('close', () => {
      this.socket = null;
      this.fail(new CloudClosedError());
    });
    return socket;
  }

  private fail(error: Error): void {
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach((waiter) => {
      waiter.reject(error);
    });
  }
}
