import {
  NODE_FRAME,
  type MachineActionSupport,
  type NodeFrame,
  type NodeHello,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../src/node/collectors/collector';
import { ComputerNode } from '../../src/node/computer-node';
import type { ComputerControls } from '../../src/node/controls/controls';
import type { MachineReport } from '../../src/node/controls/session-controls';
import { localLinks } from '../support/local-links';
import { captureLogs, testLogger } from '../support/logs';
import { until } from '../support/wait';
import { unusedControls } from './controls/unused-controls';
import { CPU, SUMMARY } from './sample-parts';

const HELLO: NodeHello = {
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
  features: ['cpu'],
  role: 'pc',
};

const READY: readonly MachineActionSupport[] = [{ action: 'unlock', state: 'ready' }];
const RING: MachineActionSupport = { action: 'ring', state: 'ready' };

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly changed: () => void;
  readonly report: (report: MachineReport | Error) => void;
  readonly stopped: () => boolean;
}

function rig(first: MachineReport | Error): Rig {
  captureLogs();
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame) => {
    sent.push(NODE_FRAME.parse(frame));
  });
  let current = first;
  let onChange = (): void => undefined;
  let stopped = false;
  const collector: ComputerCollector = {
    hello: () => HELLO,
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
  const controls: ComputerControls = {
    ...unusedControls(),
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
    machine: {
      ...unusedControls().machine,
      report: () => (current instanceof Error ? Promise.reject(current) : Promise.resolve(current)),
      watch: (listener) => {
        onChange = listener;
        return () => {
          stopped = true;
        };
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
    changed: (): void => {
      onChange();
    },
    report: (report: MachineReport | Error): void => {
      current = report;
    },
    stopped: (): boolean => stopped,
  };
}

function hellos(sent: readonly NodeFrame[]): NodeHello[] {
  return sent.flatMap((frame) => (frame.type === 'hello' ? [frame.hello] : []));
}

function machines(sent: readonly NodeFrame[]): readonly MachineActionSupport[][] {
  return sent.flatMap((frame) => (frame.type === 'machine' ? [[...frame.actions]] : []));
}

let node: ComputerNode | null = null;

beforeEach(() => {
  node?.stop();
  node = null;
});

describe('what the computer node tells the hub about its actions', () => {
  it('puts what the machine can do and the permissions in its hello', async () => {
    const test = rig({
      actions: READY,
      permissions: [{ permission: 'linux_linger', granted: true }],
    });
    node = test.node;
    test.node.start();
    await until(() => hellos(test.sent).length === 1, 'the hello');
    expect(hellos(test.sent)[0]).toMatchObject({
      actions: READY,
      permissions: [{ permission: 'linux_linger', granted: true }],
    });
  });

  it('sends a machine frame when the control says something changed', async () => {
    const test = rig({ actions: READY, permissions: [] });
    node = test.node;
    test.node.start();
    await until(() => hellos(test.sent).length === 1, 'the hello');
    test.report({ actions: [...READY, RING], permissions: [] });
    test.changed();
    await until(() => machines(test.sent).length === 1, 'the machine frame');
    expect(machines(test.sent)[0]).toEqual([...READY, RING]);
  });

  it('stays quiet when a change leaves what it can do as it was', async () => {
    const test = rig({ actions: READY, permissions: [] });
    node = test.node;
    test.node.start();
    await until(() => hellos(test.sent).length === 1, 'the hello');
    test.changed();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(machines(test.sent)).toEqual([]);
  });

  it('greets with no actions and logs when the control cannot say', async () => {
    const test = rig(new Error('loginctl missing'));
    node = test.node;
    test.node.start();
    await until(() => hellos(test.sent).length === 1, 'the hello');
    expect(hellos(test.sent)[0]?.actions).toEqual([]);
  });

  it('stops watching for changes when the node stops', async () => {
    const test = rig({ actions: READY, permissions: [] });
    test.node.start();
    await until(() => hellos(test.sent).length === 1, 'the hello');
    test.node.stop();
    expect(test.stopped()).toBe(true);
  });
});
