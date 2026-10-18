import {
  HUB_RUNTIME_CONTROL,
  NODE_AI_PATH,
  NODE_AI_PROTOCOL,
  NODE_RUNTIME_FRAME,
  type ComputerAiRuntime,
  type NodeFrame,
  type NodeHello,
  type NodeRuntimeFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { NodeHubTransport } from '../client-network/node-transport';
import { z } from 'zod';
import { HUB_COMPUTER_FRAME, NODE_COMPUTER_FRAME } from './computer-channel';
import { NodeConnection } from './node-connection';

const HUB_SOCKET_FRAME = z.discriminatedUnion('type', [
  ...HUB_RUNTIME_CONTROL.options,
  HUB_COMPUTER_FRAME,
]);
export type HubSocketFrame = z.infer<typeof HUB_SOCKET_FRAME>;

export interface NodeAiLinkOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly deviceId: string;
  readonly hello: NodeHello;
  readonly log: Logger;
  readonly transport?: NodeHubTransport;
  readonly received: (frame: HubSocketFrame) => void;
  readonly runtimes?: readonly ComputerAiRuntime[];
  readonly disconnected: () => void;
}

export class NodeAiLink {
  private generation: string | null = null;
  private readonly connection: NodeConnection;
  constructor(private readonly options: NodeAiLinkOptions) {
    this.connection = new NodeConnection({
      hubUrl: options.hubUrl,
      path: NODE_AI_PATH,
      protocol: NODE_AI_PROTOCOL,
      token: options.token,
      transport: options.transport,
      log: options.log,
      failure: 'node.connection_failed',
      opened: (socket): void => {
        socket.send(
          JSON.stringify(
            NODE_RUNTIME_FRAME.parse({
              type: 'hello',
              protocol: 2,
              hello: options.hello,
              runtimes: options.runtimes ?? ['claude'],
            }),
          ),
        );
      },
      message: (_socket, text): void => {
        this.receive(text);
      },
      closed: (): void => {
        this.generation = null;
        options.disconnected();
      },
    });
  }

  start(): void {
    this.connection.start();
  }

  send(frame: NodeRuntimeFrame): void {
    this.write(frame);
  }

  sendComputer(frame: NodeFrame): void {
    this.write(NODE_COMPUTER_FRAME.parse({ type: 'computer', frame }));
  }

  stop(): void {
    this.generation = null;
    this.connection.stop();
  }

  private write(frame: unknown): void {
    const socket = this.connection.socket;
    if (socket === null || socket.readyState !== socket.OPEN || this.generation === null) return;
    socket.send(JSON.stringify(frame));
  }

  private receive(text: string): void {
    try {
      const frame = HUB_SOCKET_FRAME.parse(JSON.parse(text));
      this.accept(frame);
      this.options.received(frame);
    } catch (cause) {
      this.options.log.error('node.frame_rejected', cause);
    }
  }

  private accept(frame: HubSocketFrame): void {
    if (frame.type === 'computer') return;
    if (frame.device_id !== this.options.deviceId)
      throw new NodeProtocolError('The hub addressed another computer.');
    if (frame.type !== 'welcome') {
      if (frame.generation !== this.generation)
        throw new NodeProtocolError('The hub sent a stale generation.');
      return;
    }
    if (this.generation !== null) throw new NodeProtocolError('The hub sent a duplicate welcome.');
    this.connection.welcomed();
    this.connection.healthy();
    this.generation = frame.generation;
  }
}
class NodeProtocolError extends Error {
  override readonly name = 'NodeProtocolError';
}
