import { liveProtocols } from '@smarteverything/domain';

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
      return;
    }
    this.drop();
    const socket = this.open(liveUrlOf(serverUrl), [...liveProtocols(token)]);
    this.#socket = socket;
    this.#target = target;
    socket.addEventListener('close', () => {
      if (this.#socket === socket) {
        this.#socket = null;
        this.#target = null;
        this.lost();
      }
    });
  }

  drop(): void {
    const socket = this.#socket;
    this.#socket = null;
    this.#target = null;
    socket?.close();
  }
}
