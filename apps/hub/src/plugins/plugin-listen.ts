import { createServer, isIP, type Server } from 'node:net';
import { createSocket, type Socket } from 'node:dgram';
import type { PluginRow } from '@smarteverything/domain';
import type { PluginPortNeed } from '../firewall/openings';
import type { Unsubscribe } from './builtin/contract';

export class PluginBindError extends Error {
  override readonly name = 'PluginBindError';

  constructor(
    readonly port: number,
    readonly address: string,
    message: string,
    cause: Error,
  ) {
    super(message, { cause });
  }
}

export interface PluginNetwork {
  readonly listenTcp: (port: number, address: string) => Promise<Server>;
  readonly listenUdp: (port: number, address: string) => Promise<Socket>;
}

const BIND_MESSAGES: Readonly<Record<string, (port: string, address: string) => string>> = {
  EACCES: (port, address) =>
    `Port ${port} on ${address} needs permission: allow low ports in Settings › Connections › Server › Firewall, then restart the plugin.`,
  EADDRINUSE: (port, address) =>
    `Port ${port} on ${address} is already used by another program; stop that program, then restart the plugin.`,
  EADDRNOTAVAIL: (port, address) =>
    `${address} is not an address of this computer right now, so port ${port} cannot open there; check the network, then restart the plugin.`,
};

function bindFailure(cause: Error, port: number, address: string): Error {
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined;
  const message = code === undefined ? undefined : BIND_MESSAGES[code];
  return message === undefined
    ? cause
    : new PluginBindError(port, address, message(String(port), address), cause);
}

function listening(server: Server, port: number, address: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      reject(bindFailure(cause, port, address));
    };
    server.once('error', failed);
    server.listen({ port, host: address }, () => {
      server.off('error', failed);
      resolve(server);
    });
  });
}

function bound(socket: Socket, port: number, address: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      reject(bindFailure(cause, port, address));
    };
    socket.once('error', failed);
    socket.bind(port, address, () => {
      socket.off('error', failed);
      resolve(socket);
    });
  });
}

function closeOnce(socket: Socket): void {
  try {
    socket.close();
  } catch (cause) {
    if (
      cause instanceof Error &&
      'code' in cause &&
      cause.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING'
    ) {
      return;
    }
    throw cause;
  }
}

export function networkOf(track: (stop: Unsubscribe) => Unsubscribe): PluginNetwork {
  return {
    listenTcp: async (port, address): Promise<Server> => {
      const server = await listening(createServer(), port, address);
      track(() => {
        server.close();
      });
      return server;
    },
    listenUdp: async (port, address): Promise<Socket> => {
      const socket = await bound(
        createSocket(isIP(address) === 6 ? 'udp6' : 'udp4'),
        port,
        address,
      );
      track(() => {
        closeOnce(socket);
      });
      return socket;
    },
  };
}

export function portNeedsOf(rows: readonly PluginRow[]): PluginPortNeed[] {
  return rows
    .filter((row) => row.enabled)
    .flatMap((row) =>
      row.manifest.permissions.listen.map((listen): PluginPortNeed => ({
        pluginId: row.id,
        protocol: listen.protocol,
        port: listen.port,
      })),
    );
}
