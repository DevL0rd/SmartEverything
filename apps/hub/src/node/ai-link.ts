import {
  openNodeHubSocket,
  retireNodeHubSocket,
  type NodeHubTransport,
} from '../client-network/node-transport';
import WebSocket from 'ws';
import {
  HUB_AI_CONTROL,
  HUB_AI_CONTROL_V2,
  NODE_AI_FRAME_V2,
  NODE_AI_PROTOCOL_V2,
  NODE_AI_MANAGED_PROJECT_PROTOCOL,
  nativeProjectProjection,
  type NodeAiFrameV2,
  type HubAiControlV2,
  type ComputerAiRuntime,
  NODE_AI_FRAME,
  NODE_AI_PATH,
  NODE_AI_PROTOCOL,
  type NodeHello,
  type NodeAiFrame,
  type HubAiControl,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface NodeAiLinkOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly deviceId: string;
  readonly hello: NodeHello;
  readonly log: Logger;
  readonly transport?: NodeHubTransport;
  readonly received: (frame: HubAiControl | HubAiControlV2) => void;
  readonly runtimes?: readonly ComputerAiRuntime[];
  readonly disconnected: () => void;
}

export class NodeAiLink {
  private socket: WebSocket | null = null;
  private unsubscribeRoute: (() => void) | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private delay = 1000;
  private generation: string | null = null;
  private welcomeTimer: NodeJS.Timeout | null = null;
  constructor(private readonly options: NodeAiLinkOptions) {}

  private followRoute(): void {
    if (this.unsubscribeRoute !== null || this.options.transport === undefined) return;
    this.unsubscribeRoute = this.options.transport.subscribe(() => {
      if (this.retry !== null) clearTimeout(this.retry);
      this.retry = null;
      const socket = this.socket;
      if (socket !== null) {
        this.closed(socket);
        retireNodeHubSocket(socket);
      } else this.start();
    });
  }
  start(): void {
    if (this.socket !== null || this.stopped) return;
    this.followRoute();
    if (this.options.transport?.ready() === false) return;
    const url = new URL(NODE_AI_PATH, this.options.hubUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = openNodeHubSocket(
      this.options.transport,
      url,
      [NODE_AI_MANAGED_PROJECT_PROTOCOL, NODE_AI_PROTOCOL_V2, NODE_AI_PROTOCOL],
      {
        headers: { authorization: `Bearer ${this.options.token}` },
        maxPayload: 32 * 1024 * 1024,
        handshakeTimeout: 10_000,
      },
    );
    this.socket = socket;
    this.welcomeTimer = setTimeout(() => {
      socket.close(1008, 'Welcome timed out');
    }, 10_000);
    this.watchSocket(socket);
  }
  private watchSocket(socket: WebSocket): void {
    socket.on('open', () => {
      if (this.socket !== socket) return;
      socket.send(
        JSON.stringify(
          runtimeProtocol(socket.protocol)
            ? NODE_AI_FRAME_V2.parse({
                type: 'hello',
                protocol: 2,
                hello: this.options.hello,
                runtimes: this.options.runtimes ?? ['claude'],
              })
            : NODE_AI_FRAME.parse({ type: 'hello', protocol: 1, hello: this.options.hello }),
        ),
      );
    });
    socket.on('message', (data, binary) => {
      if (binary) {
        socket.close(1003, 'JSON text required');
        return;
      }
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      this.receive(socket, bytes.toString('utf8'));
    });
    socket.on('error', (cause) => {
      this.options.log.error('node.connection_failed', cause);
    });
    socket.on('close', () => {
      this.closed(socket);
    });
  }

  send(frame: NodeAiFrame | NodeAiFrameV2): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || this.generation === null) return false;
    const parsed = runtimeProtocol(this.socket.protocol)
      ? NODE_AI_FRAME_V2.parse(
          nativeProjectProjection(frame, this.socket.protocol === NODE_AI_MANAGED_PROJECT_PROTOCOL),
        )
      : NODE_AI_FRAME.parse(frame);
    if (
      parsed.type === 'hello' ||
      parsed.device_id !== this.options.deviceId ||
      parsed.generation !== this.generation
    )
      return false;
    this.socket.send(JSON.stringify(parsed));
    return true;
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeRoute?.();
    this.unsubscribeRoute = null;
    if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.generation = null;
    if (this.socket !== null) retireNodeHubSocket(this.socket);
    this.socket = null;
  }

  private receive(socket: WebSocket, text: string): void {
    if (this.socket !== socket) return;
    try {
      const frame = runtimeProtocol(socket.protocol)
        ? HUB_AI_CONTROL_V2.parse(JSON.parse(text))
        : HUB_AI_CONTROL.parse(JSON.parse(text));
      if (frame.device_id !== this.options.deviceId)
        throw new NodeProtocolError('The hub addressed another computer.');
      if (frame.type === 'welcome') {
        if (this.generation !== null)
          throw new NodeProtocolError('The hub sent a duplicate welcome.');
        if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
        this.welcomeTimer = null;
        this.generation = frame.generation;
        this.delay = 1000;
      } else if (frame.generation !== this.generation)
        throw new NodeProtocolError('The hub sent a stale generation.');
      this.options.received(frame);
    } catch (cause) {
      this.options.log.error('node.protocol_failed', cause);
      socket.close(1008, 'Invalid computer frame');
    }
  }

  private closed(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.generation = null;
    this.options.disconnected();
    if (this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.start();
    }, this.delay);
    this.delay = Math.min(this.delay * 2, 30_000);
  }
}
class NodeProtocolError extends Error {
  override readonly name = 'NodeProtocolError';
}

function runtimeProtocol(protocol: string): boolean {
  return protocol === NODE_AI_PROTOCOL_V2 || protocol === NODE_AI_MANAGED_PROJECT_PROTOCOL;
}
