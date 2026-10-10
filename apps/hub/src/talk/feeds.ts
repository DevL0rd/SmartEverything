import { randomBytes, randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from '@smarteverything/logging';
import { OggOpusWriter } from './ogg';

const FEED_PATH = /^\/talk-feeds\/([0-9a-f]{32})\.ogg$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const KEPT_AFTER_END_MS = 10_000;

export interface OggFeed {
  readonly url: string;
  readonly packet: (packet: Uint8Array) => void;
  readonly end: () => void;
}

interface FeedState {
  readonly pages: Buffer[];
  readonly readers: Set<ServerResponse>;
  readonly left: () => void;
  ended: boolean;
}

class FeedsNotStartedError extends Error {
  override readonly name = 'FeedsNotStartedError';

  constructor() {
    super('The talk feed server is not listening yet.');
  }
}

export class TalkFeeds {
  private readonly server: Server;
  private readonly feeds = new Map<string, FeedState>();
  private base: string | null = null;

  constructor(private readonly log: Logger) {
    this.server = createServer((request, response) => {
      this.serve(request, response);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        const address: AddressInfo | string | null = this.server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('The talk feed server did not get a TCP port.'));
          return;
        }
        this.base = `http://127.0.0.1:${String(address.port)}`;
        resolve();
      });
    });
  }

  open(left: () => void = (): void => undefined): OggFeed {
    if (this.base === null) {
      throw new FeedsNotStartedError();
    }
    const nonce = randomBytes(16).toString('hex');
    const state: FeedState = { pages: [], readers: new Set(), left, ended: false };
    this.feeds.set(nonce, state);
    const writer = new OggOpusWriter(randomInt(1, 0x7fffffff), (page) => {
      state.pages.push(page);
      state.readers.forEach((reader) => reader.write(page));
    });
    writer.start();
    return {
      url: `${this.base}/talk-feeds/${nonce}.ogg`,
      packet: (packet): void => {
        writer.packet(packet);
        writer.flush();
      },
      end: (): void => {
        if (state.ended) {
          return;
        }
        writer.end();
        state.ended = true;
        state.readers.forEach((reader) => reader.end());
        setTimeout(() => this.feeds.delete(nonce), KEPT_AFTER_END_MS).unref();
      },
    };
  }

  stop(): void {
    for (const state of this.feeds.values()) {
      state.readers.forEach((reader) => reader.destroy());
    }
    this.feeds.clear();
    this.server.closeAllConnections();
    this.server.close();
  }

  private serve(request: IncomingMessage, response: ServerResponse): void {
    const nonce = FEED_PATH.exec(request.url ?? '')?.[1];
    const state = nonce === undefined ? undefined : this.feeds.get(nonce);
    if (!LOOPBACK.has(request.socket.remoteAddress ?? '') || request.method !== 'GET') {
      this.log.warn('talk.feed_refused', { remote: request.socket.remoteAddress ?? 'unknown' });
      response.writeHead(403).end();
      return;
    }
    if (state === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'audio/ogg', 'cache-control': 'no-store' });
    state.pages.forEach((page) => response.write(page));
    if (state.ended) {
      response.end();
      return;
    }
    state.readers.add(response);
    response.once('close', () => {
      state.readers.delete(response);
      if (!state.ended) {
        this.log.warn('talk.feed_reader_left', { readersLeft: state.readers.size });
        if (state.readers.size === 0) {
          state.left();
        }
      }
    });
  }
}
