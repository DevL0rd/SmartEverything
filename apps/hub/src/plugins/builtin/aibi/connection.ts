import type { Socket } from 'node:net';
import { Upstream, type Cloud, type Scheme } from './cloud';
import {
  collector,
  HttpReader,
  requestLine,
  type Head,
  type Message,
  type Reader,
} from './http-reader';
import { encode } from './replies';

export interface Incoming {
  readonly head: Head;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly scheme: Scheme;
  readonly remote: string;
  readonly chunks: () => AsyncIterable<Buffer>;
}

export interface Exchange {
  readonly message: Message;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly scheme: Scheme;
  readonly remote: string;
  readonly forward: (replacement?: Message) => Promise<Message>;
}

export interface Routes {
  readonly streams: (method: string, path: string) => boolean;
  readonly stream: (request: Incoming) => Promise<Buffer>;
  readonly handle: (exchange: Exchange, socket: Socket) => Promise<Buffer | 'served'>;
  readonly failed: (detail: string) => void;
}

const SERVER_PROBLEM = { errcode: 500, errmsg: 'AIBI server problem' };
const UNREADABLE_REQUEST = { errcode: 400, errmsg: 'AIBI could not read that request' };

class Body {
  private readonly parts: Buffer[] = [];
  private ended = false;
  private wake: (() => void) | null = null;

  push(chunk: Buffer): void {
    this.parts.push(Buffer.from(chunk));
    this.wake?.();
  }

  end(): void {
    this.ended = true;
    this.wake?.();
  }

  async *read(): AsyncIterable<Buffer> {
    for (;;) {
      const next = this.parts.shift();
      if (next !== undefined) {
        yield next;
      } else if (this.ended) {
        return;
      } else {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
    }
  }
}

type Settled =
  | { readonly kind: 'reply'; readonly reply: Buffer | 'served' }
  | { readonly kind: 'failed'; readonly error: unknown };

function settle(work: Promise<Buffer | 'served'>): Promise<Settled> {
  return work.then(
    (reply): Settled => ({ kind: 'reply', reply }),
    (error: unknown): Settled => ({ kind: 'failed', error }),
  );
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export class Connection {
  private work: Promise<void> = Promise.resolve();
  private readonly upstream: Upstream;
  private readonly remote: string;
  private body: Body | null = null;
  private collect: Reader | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly scheme: Scheme,
    private readonly routes: Routes,
    target: Cloud,
  ) {
    this.upstream = new Upstream(scheme, target);
    this.remote = socket.remoteAddress ?? '';
    const reader = new HttpReader({
      head: (head): void => {
        this.head(head);
      },
      body: (chunk): void => {
        this.chunk(chunk);
      },
      end: (): void => {
        this.end();
      },
    });
    socket.on('data', (chunk: Buffer) => {
      this.safely(() => {
        reader.push(chunk);
      });
    });
    socket.on('error', () => {
      socket.destroy();
    });
    socket.on('close', () => {
      this.upstream.close();
    });
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.routes.failed(describe(error, 'Unreadable request'));
      this.socket.end(
        encode('HTTP/1.1 400 Bad Request', UNREADABLE_REQUEST, { Connection: 'close' }),
      );
      this.socket.destroySoon();
    }
  }

  private head(head: Head): void {
    const { method, path, query } = requestLine(head.startLine);
    if (this.routes.streams(method, path)) {
      const body = new Body();
      this.body = body;
      const request: Incoming = {
        head,
        method,
        path,
        query,
        scheme: this.scheme,
        remote: this.remote,
        chunks: () => body.read(),
      };
      this.queue(() => this.routes.stream(request));
      return;
    }
    const collected = collector((message) => {
      this.queue(() => this.routes.handle(this.exchange(message), this.socket));
    });
    this.collect = collected;
    collected.head(head);
  }

  private chunk(chunk: Buffer): void {
    if (this.body === null) {
      this.collect?.body(chunk);
    } else {
      this.body.push(chunk);
    }
  }

  private end(): void {
    this.body?.end();
    this.body = null;
    this.collect?.end();
    this.collect = null;
  }

  private exchange(message: Message): Exchange {
    const { method, path, query } = requestLine(message.startLine);
    return {
      message,
      method,
      path,
      query,
      scheme: this.scheme,
      remote: this.remote,
      forward: (replacement) => this.upstream.send(replacement ?? message),
    };
  }

  private queue(task: () => Promise<Buffer | 'served'>): void {
    const pending = settle(task());
    this.work = this.work.then(async () => {
      const outcome = await pending;
      if (this.socket.destroyed) {
        return;
      }
      if (outcome.kind === 'failed') {
        this.routes.failed(describe(outcome.error, 'Request failed'));
        this.socket.write(encode('HTTP/1.1 500 Internal Server Error', SERVER_PROBLEM));
      } else if (outcome.reply !== 'served') {
        this.socket.write(outcome.reply);
      }
    });
  }
}
