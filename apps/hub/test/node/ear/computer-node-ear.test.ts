import {
  NODE_FRAME,
  type ListeningHubMessage,
  type ListeningNodeMessage,
  type NodeFrame,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../../src/node/collectors/collector';
import { ComputerNode } from '../../../src/node/computer-node';
import type { ComputerControls } from '../../../src/node/controls/controls';
import type { EarPort } from '../../../src/node/ear/computer-ear';
import { localLinks } from '../../support/local-links';
import { until } from '../../support/wait';
import { captureLogs, testLogger } from '../../support/logs';
import { unusedControls } from '../controls/unused-controls';

const refused = (): Promise<never> => Promise.reject(new Error('unused'));

const CONTROLS: ComputerControls = {
  ...unusedControls(),
  power: { available: () => Promise.resolve([]), run: refused },
  processes: {
    list: refused,
    signal: () => undefined,
    watch: () => undefined,
    read: () => null,
    stop: () => undefined,
  },
  links: () => [],
  session: {
    start: refused,
    stop: () => Promise.resolve(),
    setVolume: refused,
    setMuted: refused,
    playback: refused,
  },
  apps: { installed: refused, open: refused, close: refused },
  files: { list: refused, read: refused, range: refused },
  capture: { capture: refused },
};

const COLLECTOR: ComputerCollector = {
  hello: () => {
    throw new Error('not greeted in this test');
  },
  readers: {
    summary: () => null,
    cpu: () => null,
    gpu: () => null,
    memory: () => null,
    disks: () => null,
    network: () => null,
    sensors: () => null,
    power: () => null,
  },
  track: () => undefined,
  stop: () => undefined,
};

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly received: ListeningHubMessage[];
  readonly stops: number[];
  readonly hub: ReturnType<typeof localLinks>['hub'];
  readonly post: (message: ListeningNodeMessage) => void;
}

function rig(): Rig {
  captureLogs();
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame) => {
    sent.push(NODE_FRAME.parse(frame));
  });
  const received: ListeningHubMessage[] = [];
  const stops: number[] = [];
  const posts: ((message: ListeningNodeMessage) => void)[] = [];
  const node = new ComputerNode({
    collector: COLLECTOR,
    controls: CONTROLS,
    link: links.node,
    now: (): Date => new Date(),
    log: testLogger('node'),
    ear: (post): EarPort => {
      posts.push(post);
      return {
        receive: (message): void => {
          received.push(message);
        },
        stop: (): Promise<void> => {
          stops.push(1);
          return Promise.resolve();
        },
      };
    },
  });
  node.start();
  return {
    node,
    sent,
    received,
    stops,
    hub: links.hub,
    post: (message): void => {
      posts[0]?.(message);
    },
  };
}

describe('computer node ear frames', () => {
  it('hands hub ear frames to the ear and ends the ear with the node', () => {
    const { node, received, stops, hub } = rig();
    hub.send({ type: 'ear', ear: { kind: 'level', watched: true } });
    hub.send({ type: 'ear', ear: { kind: 'call', active: true } });
    expect(received).toEqual([
      { kind: 'level', watched: true },
      { kind: 'call', active: true },
    ]);
    node.stop();
    expect(stops).toEqual([1]);
  });

  it('puts what the ear sends on the link as ear frames', async () => {
    const { node, sent, post } = rig();
    post({ kind: 'state', state: 'discord_call' });
    await until(() => sent.some((frame) => frame.type === 'ear'), 'the ear frame');
    expect(sent.find((frame) => frame.type === 'ear')).toEqual({
      type: 'ear',
      ear: { kind: 'state', state: 'discord_call' },
    });
    node.stop();
  });
});
