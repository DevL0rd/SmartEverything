import {
  NODE_FRAME,
  type ComputerFeature,
  type HubFrame,
  type NodeFrame,
  type NodeHello,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../../src/node/collectors/collector';
import { ComputerNode } from '../../../src/node/computer-node';
import { EarHost, type EarHostFactory } from '../../../src/node/ear/ear-host';
import { FakeClock } from '../../support/fake-clock';
import { localLinks } from '../../support/local-links';
import { captureLogs, testLogger, type CapturedLogs } from '../../support/logs';
import { until } from '../../support/wait';
import { inertControls } from '../controls/unused-controls';
import { CPU, SUMMARY } from '../sample-parts';
import { configOf, earRig, packetsOf, tone, type EarRig } from './ear-fakes';

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

const COLLECTOR: ComputerCollector = {
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

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

interface Rig {
  readonly node: ComputerNode;
  readonly sent: NodeFrame[];
  readonly hub: (frame: HubFrame) => void;
  readonly earRig: EarRig;
}

function rig(host: 'hosting' | 'none' = 'hosting', fakes: EarRig = earRig()): Rig {
  const links = localLinks();
  const sent: NodeFrame[] = [];
  links.hub.onFrame((frame) => {
    sent.push(NODE_FRAME.parse(frame));
  });
  const clock = new FakeClock('2026-10-18T10:00:00.000Z');
  const earHost: EarHostFactory = (send) =>
    new EarHost({ engine: fakes.engine, clock, log: testLogger('node-ear') }, send);
  const node = new ComputerNode({
    collector: COLLECTOR,
    controls: inertControls(),
    link: links.node,
    now: (): Date => new Date(),
    log: testLogger('node'),
    ...(host === 'hosting' ? { earHost } : {}),
  });
  node.start();
  return {
    node,
    sent,
    hub: (frame): void => {
      links.hub.send(frame);
    },
    earRig: fakes,
  };
}

function featuresOf(sent: readonly NodeFrame[]): readonly ComputerFeature[] | null {
  const hello = sent.find((frame) => frame.type === 'hello');
  return hello?.type === 'hello' ? hello.hello.features : null;
}

describe('computer node as an ear host', () => {
  it('advertises ear_host once the spotter and the speech model have loaded', async () => {
    const { node, sent, earRig: fakes } = rig();
    await until(() => featuresOf(sent) !== null, 'the hello');
    expect(featuresOf(sent)).toContain('ear_host');
    expect(fakes.models.map((model) => model.released)).toEqual([1]);
    node.stop();
  });

  it('does not advertise ear_host and says why when the spotter cannot load', async () => {
    const fakes = earRig();
    fakes.keywords.failEarConfig = true;
    const { node, sent } = rig('hosting', fakes);
    await until(() => featuresOf(sent) !== null, 'the hello');
    expect(featuresOf(sent)).not.toContain('ear_host');
    expect(logs.events()).toContain('node.ear_host_unavailable');
    node.stop();
  });

  it('does not advertise ear_host without an ear host', async () => {
    const { node, sent } = rig('none');
    await until(() => featuresOf(sent) !== null, 'the hello');
    expect(featuresOf(sent)).not.toContain('ear_host');
    node.stop();
  });

  it('opens an ear for an ears_open frame and answers with ears frames keyed by source', async () => {
    const { node, sent, hub, earRig: fakes } = rig();
    fakes.keywords.wakeAfterSamples = 8000;
    hub({
      type: 'ears_open',
      source: { kind: 'camera', key: 'living' },
      codec: 'opus_48k_mono',
      config: configOf(),
    });
    await until(() => logs.events().includes('ear_host.listening'), 'the ear');
    hub({ type: 'ears_audio', key: 'living', packets: packetsOf(tone(700)) });
    const reply = sent.find((frame) => frame.type === 'ears');
    expect(reply).toMatchObject({
      type: 'ears',
      key: 'living',
      ear: { kind: 'claim', claim: { phrase: 'hey jarvis' } },
    });
    node.stop();
  });

  it('frees every open ear when the node stops', async () => {
    const { node, hub, earRig: fakes } = rig();
    hub({
      type: 'ears_open',
      source: { kind: 'camera', key: 'living' },
      codec: 'opus_48k_mono',
      config: configOf(),
    });
    hub({
      type: 'ears_open',
      source: { kind: 'talk', key: 'message-1' },
      codec: 'opus_48k_mono',
      config: configOf(),
    });
    await until(
      () => logs.events().filter((event) => event === 'ear_host.listening').length === 2,
      'both ears',
    );
    hub({ type: 'ears_audio', key: 'living', packets: packetsOf(tone(40)) });
    hub({ type: 'ears_audio', key: 'message-1', packets: packetsOf(tone(40)) });
    expect(fakes.keywords.openStreams).toBeGreaterThan(0);
    node.stop();
    await until(() => fakes.models.every((model) => model.released >= 1), 'the models to be freed');
    expect(fakes.keywords.openStreams).toBe(0);
  });

  it('refuses and names ears frames when it is not an ear host', () => {
    const { node, hub } = rig('none');
    hub({
      type: 'ears_open',
      source: { kind: 'camera', key: 'living' },
      codec: 'opus_48k_mono',
      config: configOf(),
    });
    expect(logs.events()).toContain('node.ears_unsupported');
    node.stop();
  });
});
