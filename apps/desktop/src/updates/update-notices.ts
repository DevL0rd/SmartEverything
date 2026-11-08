import {
  APP_UPDATE_NOTICE,
  MEDIA_PATHS,
  liveProtocols,
  type DesktopServer,
  type MachineUpdateStatus,
} from '@smarteverything/domain';
import type { HubLease } from '@smarteverything/hub/client-network/lease';
import { Logger, messageOf } from '@smarteverything/logging';
import WebSocket from 'ws';

const log = new Logger('desktop.update');

export interface NoticeRoute {
  readonly server: () => Promise<DesktopServer | null>;
  readonly lease: (server: DesktopServer, input: string) => HubLease;
}

const REQUIRED_SENTENCE =
  'This computer must update SmartEverything Desktop before it can connect to your home.';

export function requiredUpdateStatus(
  status: MachineUpdateStatus,
  required: boolean,
): MachineUpdateStatus & { readonly required?: true } {
  if (!required) return status;
  if (status.state === 'downloading' || status.state === 'installing')
    return { ...status, required: true };
  return { ...status, required: true, detail: `${REQUIRED_SENTENCE} ${status.detail}` };
}

const SUBSCRIBE = JSON.stringify({ type: 'subscribe', tables: [], streams: [] });

function isDesktopRelease(data: WebSocket.RawData): boolean {
  let message: unknown;
  try {
    message = JSON.parse(
      new TextDecoder().decode(Array.isArray(data) ? Buffer.concat(data) : data),
    );
  } catch (cause) {
    log.warn('update.notice_unreadable', { reason: messageOf(cause) });
    return false;
  }
  const notice = APP_UPDATE_NOTICE.safeParse(message);
  return notice.success && notice.data.platform === 'desktop' && notice.data.channel === 'release';
}

function socketUrl(lease: HubLease): string {
  return lease.url.href.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:');
}

export class MachineNoticeWatch {
  readonly #route: NoticeRoute;
  readonly #changed: () => void;
  #socket: WebSocket | null = null;
  #generation = 0;

  constructor(route: NoticeRoute, changed: () => void) {
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
      if (isDesktopRelease(data)) this.#changed();
    });
    socket.on('error', (cause) => {
      log.warn('update.notice_socket_failed', { reason: messageOf(cause) });
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
