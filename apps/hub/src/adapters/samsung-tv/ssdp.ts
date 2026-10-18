import { createSocket } from 'node:dgram';
import {
  readSsdpAnnouncement,
  readSsdpAnswer,
  SSDP_ADDRESS,
  SSDP_PORT,
  SSDP_WAIT_SECONDS,
  ssdpSearchMessage,
} from '@smarteverything/smartthings';

export type SsdpSearch = () => Promise<readonly string[]>;

const LISTEN_MS = (SSDP_WAIT_SECONDS + 1) * 1000;

export const ssdpSearch: SsdpSearch = () =>
  new Promise((resolve, reject) => {
    const hosts = new Set<string>();
    const socket = createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      resolve([...hosts]);
    }, LISTEN_MS);
    socket.on('message', (message, sender) => {
      const host = readSsdpAnswer(message.toString('utf8'), sender.address);
      if (host !== null) {
        hosts.add(host);
      }
    });
    socket.once('error', (cause) => {
      clearTimeout(timer);
      socket.close();
      reject(cause);
    });
    socket.bind(() => {
      socket.send(ssdpSearchMessage(), SSDP_PORT, SSDP_ADDRESS, (cause) => {
        if (cause !== null) {
          clearTimeout(timer);
          socket.close();
          reject(cause);
        }
      });
    });
  });

export type SsdpAnnouncements = (
  heard: (host: string) => void,
  failed: (cause: unknown) => void,
) => () => void;

export const watchSsdpAnnouncements: SsdpAnnouncements = (heard, failed) => {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (message, sender) => {
    const host = readSsdpAnnouncement(message.toString('utf8'), sender.address);
    if (host !== null) {
      heard(host);
    }
  });
  socket.on('error', failed);
  socket.bind(SSDP_PORT, () => {
    try {
      socket.addMembership(SSDP_ADDRESS);
    } catch (cause) {
      failed(cause);
    }
  });
  return () => {
    socket.close();
  };
};
