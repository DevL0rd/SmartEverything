import { MEDIA_PATHS, liveProtocols, PLANNER_PHONE_RINGS_NOTICE } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import WebSocket from 'ws';
import type { RingHubLease, RingHubRoute } from './ring-hub.js';

const log = new Logger('desktop.planner-ring');

const SUBSCRIBE = JSON.stringify({ type: 'subscribe', tables: [], streams: [] });

export function isRingSetNotice(data: WebSocket.RawData): boolean {
  let message: unknown;
  try {
    message = JSON.parse(
      new TextDecoder().decode(Array.isArray(data) ? Buffer.concat(data) : data),
    );
  } catch (cause) {
    log.warn('planner_ring.notice_unreadable', { reason: messageOf(cause) });
    return false;
  }
  return PLANNER_PHONE_RINGS_NOTICE.safeParse(message).success;
}

function socketUrl(lease: RingHubLease): string {
  return lease.url.href.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:');
}

export class RingNoticeWatch {
  readonly #route: RingHubRoute;
  readonly #changed: () => void;
  #socket: WebSocket | null = null;
  #generation = 0;

  constructor(route: RingHubRoute, changed: () => void) {
    this.#route = route;
    this.#changed = changed;
  }

  async connect(): Promise<void> {
    const generation = this.#close();
    const server = await this.#route.server();
    if (server === null || generation !== this.#generation) return;
    const lease = this.#route.lease(server, new URL(MEDIA_PATHS.live, server.url).href);
    const socket = new WebSocket(socketUrl(lease), [...liveProtocols(server.token)], {
      ...(lease.agent === undefined ? {} : { agent: lease.agent }),
      ...(lease.signal === undefined ? {} : { signal: lease.signal }),
      followRedirects: false,
      perMessageDeflate: false,
    });
    this.#socket = socket;
    socket.on('open', () => {
      socket.send(SUBSCRIBE);
    });
    socket.on('message', (data) => {
      if (isRingSetNotice(data)) this.#changed();
    });
    socket.on('error', (cause) => {
      log.warn('planner_ring.notice_socket_failed', { reason: messageOf(cause) });
      socket.terminate();
    });
    socket.on('close', () => {
      if (this.#socket === socket) this.#socket = null;
    });
  }

  close(): void {
    this.#close();
  }

  #close(): number {
    this.#generation += 1;
    this.#socket?.terminate();
    this.#socket = null;
    return this.#generation;
  }
}
