import { BROADCAST_ADDRESS, WAKE_ON_LAN_PORT } from '@smarteverything/smartthings';
import WebSocket from 'ws';
import { systemClock, type Clock } from '../../clock';
import { udpSender } from '../../network/udp-sender';
import { watchSsdpAnnouncements, type SsdpAnnouncements } from './ssdp';

export interface SamsungTvIo {
  readonly fetch: typeof fetch;
  readonly sendMagicPacket: (packet: Uint8Array) => Promise<void>;
  readonly openSocket: (url: string) => WebSocket;
  readonly clock: Clock;
  readonly announcements: SsdpAnnouncements;
}

export function openTvSocket(url: string): WebSocket {
  return new WebSocket(url, { rejectUnauthorized: false });
}

export const SAMSUNG_TV_IO: SamsungTvIo = {
  fetch: globalThis.fetch,
  sendMagicPacket: udpSender(BROADCAST_ADDRESS, WAKE_ON_LAN_PORT),
  openSocket: openTvSocket,
  clock: systemClock,
  announcements: watchSsdpAnnouncements,
};
