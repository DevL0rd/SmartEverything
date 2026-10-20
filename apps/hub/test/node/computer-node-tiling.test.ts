import { NODE_FRAME, type ComputerFeature, type NodeFrame } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../src/node/collectors/collector';
import { ComputerNode } from '../../src/node/computer-node';
import type { ComputerControls } from '../../src/node/controls/controls';
import { localLinks } from '../support/local-links';
import { captureLogs, testLogger } from '../support/logs';
import { until } from '../support/wait';
import { unusedControls } from './controls/unused-controls';
import { CPU, SUMMARY } from './sample-parts';

const HELLO_FEATURES: readonly ComputerFeature[] = ['cpu', 'windows'];

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly konveyor: (running: boolean) => void;
  readonly stopped: () => { readonly presence: boolean; readonly control: boolean };
}

function rig(running: boolean): Rig {
  captureLogs();
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame) => {
    sent.push(NODE_FRAME.parse(frame));
  });
  let present = running;
  let onPresence = (): void => undefined;
  const stopped = { presence: false, control: false };
  const collector: ComputerCollector = {
    hello: () => ({
      machineId: '0123456789abcdef0123456789abcdef',
      hostname: 'desk',
      os: { name: 'Linux', kernel: '6.0' },
      hardware: { vendor: null, product: null, portable: false },
      cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
      memoryBytes: 8e9,
      interfaces: [],
      bootedAt: '2026-10-08T09:00:00.000Z',
      power: [],
      actions: [],
      permissions: [],
      features: [...HELLO_FEATURES],
      role: 'pc',
    }),
    readers: {
      summary: () => SUMMARY,
      cpu: () => CPU,
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
  const unused = unusedControls();
  const controls: ComputerControls = {
    ...unused,
    power: { available: () => Promise.resolve([]), run: () => Promise.resolve() },
    processes: {
      list: () => Promise.reject(new Error('unused')),
      signal: () => undefined,
      watch: () => undefined,
      read: () => null,
      stop: () => undefined,
    },
    links: () => [],
    session: {
      start: () => Promise.reject(new Error('no session')),
      stop: () => Promise.resolve(),
      setVolume: () => Promise.resolve(),
      setMuted: () => Promise.resolve(),
      playback: () => Promise.resolve(),
    },
    apps: {
      installed: () => Promise.resolve([]),
      open: () => Promise.resolve(),
      close: () => Promise.resolve(0),
    },
    files: {
      list: () => Promise.reject(new Error('unused')),
      read: () => Promise.reject(new Error('unused')),
      range: () => Promise.reject(new Error('unused')),
    },
    capture: { capture: () => Promise.reject(new Error('unused')) },
    tiling: {
      ...unused.tiling,
      features: () => Promise.resolve(present ? ['tiling'] : []),
      watchPresence: (listener) => {
        onPresence = listener;
        return () => {
          stopped.presence = true;
        };
      },
      stop: () => {
        stopped.control = true;
        return Promise.resolve();
      },
    },
  };
  const node = new ComputerNode({
    collector,
    controls,
    link: links.node,
    now: (): Date => new Date(),
    log: testLogger('node'),
  });
  return {
    node,
    sent,
    konveyor: (next): void => {
      present = next;
      onPresence();
    },
    stopped: () => ({ ...stopped }),
  };
}

function helloFeatures(sent: readonly NodeFrame[]): readonly (readonly ComputerFeature[])[] {
  return sent.flatMap((frame) => (frame.type === 'hello' ? [frame.hello.features] : []));
}

function featureFrames(sent: readonly NodeFrame[]): readonly (readonly ComputerFeature[])[] {
  return sent.flatMap((frame) => (frame.type === 'features' ? [frame.features] : []));
}

let node: ComputerNode | null = null;

beforeEach(() => {
  node?.stop();
  node = null;
});

describe('what the computer node says about tiling', () => {
  it('lists tiling in its hello while Konveyor runs', async () => {
    const test = rig(true);
    node = test.node;
    test.node.start();
    await until(() => helloFeatures(test.sent).length === 1, 'the hello');
    expect(helloFeatures(test.sent)[0]).toEqual([
      'cpu',
      'windows',
      'processes',
      'files',
      'capture',
      'tiling',
    ]);
  });

  it('leaves tiling out of its hello when Konveyor is not running', async () => {
    const test = rig(false);
    node = test.node;
    test.node.start();
    await until(() => helloFeatures(test.sent).length === 1, 'the hello');
    expect(helloFeatures(test.sent)[0]).not.toContain('tiling');
  });

  it('sends the features again when Konveyor starts and when it stops, without a new hello', async () => {
    const test = rig(false);
    node = test.node;
    test.node.start();
    await until(() => helloFeatures(test.sent).length === 1, 'the hello');
    test.konveyor(true);
    await until(() => featureFrames(test.sent).length === 1, 'the feature frame');
    expect(featureFrames(test.sent)[0]).toEqual([
      'cpu',
      'windows',
      'processes',
      'files',
      'capture',
      'tiling',
    ]);
    test.konveyor(false);
    await until(() => featureFrames(test.sent).length === 2, 'the second feature frame');
    expect(featureFrames(test.sent)[1]).toEqual([
      'cpu',
      'windows',
      'processes',
      'files',
      'capture',
    ]);
    expect(helloFeatures(test.sent)).toHaveLength(1);
  });

  it('stays quiet when the owner changes but tiling stays as it was', async () => {
    const test = rig(true);
    node = test.node;
    test.node.start();
    await until(() => helloFeatures(test.sent).length === 1, 'the hello');
    test.konveyor(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(featureFrames(test.sent)).toEqual([]);
  });

  it('stops watching and releases the desktop connection when the node stops', async () => {
    const test = rig(true);
    test.node.start();
    await until(() => helloFeatures(test.sent).length === 1, 'the hello');
    test.node.stop();
    expect(test.stopped()).toEqual({ presence: true, control: true });
  });
});
