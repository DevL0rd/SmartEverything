import type { ShellyTransportTls } from '@smarteverything/shelly';
import {
  ShellyAuthenticationError,
  ShellyConnectionError,
  ShellyRpc,
  type ShellyNotification,
} from '@smarteverything/shelly/rpc';
import WebSocket from 'ws';
import type { ShellyDevice } from '@smarteverything/shelly';
import { messageOf } from '@smarteverything/logging';

const OPEN_MS = 10000;
const KEEPALIVE_MS = 30000;

export interface ShellyLink {
  readonly address: string;
  readonly id: string;
  readonly password: string | null;
  readonly tls: ShellyTransportTls | null;
  readonly signal: AbortSignal;
  readonly notification?: (notification: ShellyNotification) => void;
  readonly closed?: (cause: unknown) => void;
}

function socketUrl(address: string): string {
  const url = new URL('/rpc', address);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function keepAlive(socket: WebSocket, dead: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      socket.ping();
      timer = setTimeout(dead, OPEN_MS);
      timer.unref();
    }, KEEPALIVE_MS);
    timer.unref();
  };
  socket.on('pong', arm);
  arm();
  return (): void => {
    if (timer !== null) clearTimeout(timer);
  };
}

function socketOptions(tls: ShellyTransportTls | null): WebSocket.ClientOptions {
  return {
    handshakeTimeout: OPEN_MS,
    ...(tls === null
      ? {}
      : {
          rejectUnauthorized: true,
          ...(tls.caPem === null ? {} : { ca: tls.caPem }),
          ...(tls.clientCertificate === null ? {} : { cert: tls.clientCertificate }),
          ...(tls.clientKey === null ? {} : { key: tls.clientKey }),
        }),
  };
}

function bridge(socket: WebSocket, link: ShellyLink): ShellyRpc {
  const rpc = new ShellyRpc({
    id: link.id,
    password: link.password,
    transport: {
      send: (text): void => {
        socket.send(text, (cause) => {
          if (cause instanceof Error)
            rpc.fail(new ShellyConnectionError('send', 'the socket refused the frame', cause));
        });
      },
      close: (): void => {
        socket.terminate();
      },
    },
    notification: (notification): void => {
      link.notification?.(notification);
    },
    closed: (cause): void => {
      link.closed?.(cause);
    },
  });
  const stopKeepAlive = keepAlive(socket, () => {
    rpc.fail(new ShellyConnectionError('keepalive', 'the device stopped answering'));
  });
  const abort = (): void => {
    rpc.close();
  };
  link.signal.addEventListener('abort', abort, { once: true });
  socket.on('message', (data) => {
    rpc.receive(new TextDecoder().decode(Array.isArray(data) ? Buffer.concat(data) : data));
  });
  socket.on('close', () => {
    stopKeepAlive();
    link.signal.removeEventListener('abort', abort);
    rpc.fail(new ShellyConnectionError('socket', 'the connection closed'));
  });
  socket.on('error', () => {
    rpc.fail(new ShellyConnectionError('socket', 'the device cannot be reached'));
  });
  return rpc;
}

export function openShellyRpc(link: ShellyLink): Promise<ShellyRpc> {
  const socket = new WebSocket(socketUrl(link.address), socketOptions(link.tls));
  const rpc = bridge(socket, link);
  return new Promise((resolve, reject) => {
    socket.once('open', () => {
      resolve(rpc);
    });
    socket.once('close', () => {
      reject(new ShellyConnectionError('connect', 'the connection closed'));
    });
    if (link.signal.aborted) rpc.close();
  });
}

export function failureConnection(cause: unknown): ShellyDevice['connection'] {
  const reason = messageOf(cause);
  return { state: cause instanceof ShellyAuthenticationError ? 'needs_auth' : 'offline', reason };
}
