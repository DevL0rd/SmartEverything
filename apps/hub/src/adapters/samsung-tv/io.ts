import WebSocket from 'ws';
import { systemClock, type Clock } from '../../clock';
import { sendMagicPacket } from '../../network/wake-on-lan';
import { watchSsdpAnnouncements, type SsdpAnnouncements } from './ssdp';

export interface SamsungTvIo {
  readonly fetch: typeof fetch;
  readonly sendMagicPacket: (packet: Uint8Array, host: string) => Promise<void>;
  readonly openSocket: (url: string) => WebSocket;
  readonly clock: Clock;
  readonly announcements: SsdpAnnouncements;
}

export function openTvSocket(url: string): WebSocket {
  return new WebSocket(url, { rejectUnauthorized: false });
}

export const SAMSUNG_TV_IO: SamsungTvIo = {
  fetch: globalThis.fetch,
  sendMagicPacket,
  openSocket: openTvSocket,
  clock: systemClock,
  announcements: watchSsdpAnnouncements,
};
