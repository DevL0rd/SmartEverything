import { HUB_FRAME, NODE_FRAME, type HubFrame, type NodeFrame } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { ComputerNode } from './computer-node';
import { pipeLink, type NodeLink } from './link';

const log = new Logger('hub.node');

export const NODE_COMPUTER_FRAME = z.strictObject({
  type: z.literal('computer'),
  frame: NODE_FRAME,
});
export const HUB_COMPUTER_FRAME = z.strictObject({
  type: z.literal('computer'),
  frame: HUB_FRAME,
});

export interface NodeComputerChannelOptions {
  readonly create: (link: NodeLink) => ComputerNode | null;
  readonly send: (frame: NodeFrame) => void;
}

export class NodeComputerChannel {
  private open: {
    readonly node: ComputerNode;
    readonly deliver: (frame: HubFrame) => void;
  } | null = null;

  constructor(private readonly options: NodeComputerChannelOptions) {}

  start(): void {
    this.stop();
    log.debug('computer.channel_starting', {});
    const pipe = pipeLink<NodeFrame, HubFrame>(this.options.send);
    const node = this.options.create(pipe.link);
    if (node === null) {
      log.info('computer.channel_not_created', { reason: 'no_node' });
      return;
    }
    this.open = { node, deliver: pipe.deliver };
    node.start();
  }

  receive(frame: HubFrame): void {
    this.open?.deliver(frame);
  }

  stop(): void {
    if (this.open !== null) log.debug('computer.channel_stopping', {});
    this.open?.node.stop();
    this.open = null;
  }
}
