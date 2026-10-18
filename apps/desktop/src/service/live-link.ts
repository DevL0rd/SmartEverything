import { liveProtocols } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const log = new Logger('desktop.live-link');

export interface LiveSocket {
  readonly close: () => void;
  addEventListener(type: 'close', listener: () => void): void;
}

export type OpenSocket = (url: string, protocols: string[]) => LiveSocket;

export const openWebSocket: OpenSocket = (url, protocols) => new WebSocket(url, protocols);

export function liveUrlOf(serverUrl: string): string {
  const url = new URL('/live', serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export class LiveLink {
  #socket: LiveSocket | null = null;
  #target: string | null = null;

  constructor(
    private readonly open: OpenSocket,
    private readonly lost: () => void,
  ) {}

  follow(serverUrl: string, token: string): void {
    const target = `${serverUrl} ${token}`;
    if (this.#socket !== null && this.#target === target) {
      log.trace('live.follow_unchanged');
      return;
    }
    this.drop();
    log.info('live.opening', { host: new URL(serverUrl).host });
    const socket = this.open(liveUrlOf(serverUrl), [...liveProtocols(token)]);
    this.#socket = socket;
    this.#target = target;
    socket.addEventListener('close', () => {
      log.info('live.closed', { current: this.#socket === socket });
      if (this.#socket === socket) {
        this.#socket = null;
        this.#target = null;
        this.lost();
      }
    });
  }

  drop(): void {
    const socket = this.#socket;
    if (socket !== null) log.debug('live.dropping');
    this.#socket = null;
    this.#target = null;
    socket?.close();
  }
}
