import { createServer, isIP, type Server } from 'node:net';
import { createSocket, type Socket } from 'node:dgram';
import type { PluginListen, PluginRow } from '@smarteverything/domain';
import type { PluginPortNeed } from '../firewall/openings';
import type { Unsubscribe } from './builtin/contract';

class PluginPortUndeclaredError extends Error {
  override readonly name = 'PluginPortUndeclaredError';

  constructor(
    readonly pluginId: string,
    readonly protocol: string,
    readonly port: number,
  ) {
    super(
      `${pluginId} may only listen on the ports its manifest declares in permissions.listen; ${protocol.toUpperCase()} ${String(port)} is not one of them.`,
    );
  }
}

class PluginPortAddressError extends Error {
  override readonly name = 'PluginPortAddressError';

  constructor(readonly address: string) {
    super(`A plugin listens on an IP address; received ${JSON.stringify(address)}.`);
  }
}

class PluginPortDeniedError extends Error {
  override readonly name = 'PluginPortDeniedError';

  constructor(
    readonly port: number,
    readonly address: string,
  ) {
    super(
      `Port ${String(port)} on ${address} needs permission: allow low ports in Settings › Connections › Server › Firewall, then restart the plugin.`,
    );
  }
}

class PluginPortInUseError extends Error {
  override readonly name = 'PluginPortInUseError';

  constructor(
    readonly port: number,
    readonly address: string,
  ) {
    super(
      `Port ${String(port)} on ${address} is already used by another program; stop that program, then restart the plugin.`,
    );
  }
}

class PluginPortAddressUnavailableError extends Error {
  override readonly name = 'PluginPortAddressUnavailableError';

  constructor(
    readonly port: number,
    readonly address: string,
  ) {
    super(
      `${address} is not an address of this computer right now, so port ${String(port)} cannot open there; check the network, then restart the plugin.`,
    );
  }
}

export interface PluginNetwork {
  readonly listenTcp: (port: number, address: string) => Promise<Server>;
  readonly listenUdp: (port: number, address: string) => Promise<Socket>;
  readonly connectUdp: (port: number, address: string) => Promise<Socket>;
}

const BIND_ERRORS: Readonly<Record<string, new (port: number, address: string) => Error>> = {
  EACCES: PluginPortDeniedError,
  EADDRINUSE: PluginPortInUseError,
  EADDRNOTAVAIL: PluginPortAddressUnavailableError,
};

function bindFailure(cause: Error, port: number, address: string): Error {
  const code = 'code' in cause ? cause.code : undefined;
  const named = typeof code === 'string' ? BIND_ERRORS[code] : undefined;
  return named === undefined ? cause : new named(port, address);
}

interface ListenRequest {
  readonly pluginId: string;
  readonly listens: readonly PluginListen[];
  readonly protocol: PluginListen['protocol'];
  readonly port: number;
  readonly address: string;
}

function declared({ pluginId, listens, protocol, port, address }: ListenRequest): void {
  if (!listens.some((listen) => listen.protocol === protocol && listen.port === port)) {
    throw new PluginPortUndeclaredError(pluginId, protocol, port);
  }
  if (isIP(address) === 0) {
    throw new PluginPortAddressError(address);
  }
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

function connecting(socket: Socket, port: number, address: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      socket.off('close', closed);
      reject(cause);
    };
    const closed = (): void => {
      socket.off('error', failed);
      reject(new PluginUdpClosedError());
    };
    socket.once('error', failed);
    socket.once('close', closed);
    socket.connect(port, address, () => {
      socket.off('error', failed);
      socket.off('close', closed);
      resolve(socket);
    });
  });
}
class PluginUdpClosedError extends Error {
  override readonly name = 'PluginUdpClosedError';
  constructor() {
    super('The plugin stopped before its outgoing UDP socket connected.');
  }
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

export function networkOf(
  pluginId: string,
  listens: readonly PluginListen[],
  track: (stop: Unsubscribe) => Unsubscribe,
): PluginNetwork {
  return {
    listenTcp: async (port, address): Promise<Server> => {
      declared({ pluginId, listens, protocol: 'tcp', port, address });
      const server = await listening(createServer(), port, address);
      track(() => {
        server.close();
      });
      return server;
    },
    connectUdp: async (port, address): Promise<Socket> => {
      declared({ pluginId, listens, protocol: 'udp', port, address });
      const socket = createSocket(isIP(address) === 6 ? 'udp6' : 'udp4');
      const release = track(() => {
        closeOnce(socket);
      });
      socket.once('close', release);
      try {
        return await connecting(socket, port, address);
      } catch (cause) {
        release();
        throw cause;
      }
    },
    listenUdp: async (port, address): Promise<Socket> => {
      declared({ pluginId, listens, protocol: 'udp', port, address });
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
