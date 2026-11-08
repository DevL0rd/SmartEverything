import { readFile } from 'node:fs/promises';
import {
  API_ENDPOINTS,
  COMPUTER_SERVICE_CONFIG,
  type ComputerSummary,
  type NodeHello,
} from '@smarteverything/domain';
import { afterEach, beforeEach } from 'vitest';
import { NodeAiRuntime } from '../../src/node/ai-runtime';
import { ComputerNode } from '../../src/node/computer-node';
import type { ComputerControls } from '../../src/node/controls/controls';
import type { ComputerRuntimeHost } from '../../src/computers/runtime-host';
import type { EarFactory } from '../../src/node/ear/computer-ear';
import { unusedControls } from '../node/controls/unused-controls';
import { nodeIdentity } from '../../src/node/identity';
import { pairNode } from '../../src/node/setup';
import { nodeLayout } from '../../src/data-layout';
import { bootServer, pairPhone, verifiedPublicUrl, type Booted } from './booted';
import { captureLogs, testLogger } from './logs';
import { call, temporaryDirectory } from './server';

export interface Paired {
  readonly token: string;
  readonly deviceId: string;
  readonly hello: NodeHello;
}

const READ_AT = '2026-10-17T09:00:00.000Z';

const SUMMARY: ComputerSummary = {
  cpuLoad: 12,
  cpuTemperature: null,
  memoryPercent: 25,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 0,
  uploadRate: 0,
  fullestDisk: null,
  batteryLevel: null,
  charging: null,
  totalWatts: null,
  processCount: 0,
  uptimeSeconds: 60,
};

export function stubControls(overrides: Partial<ComputerControls> = {}): ComputerControls {
  return {
    power: { available: () => Promise.resolve([]), run: () => Promise.resolve() },
    processes: {
      list: () => Promise.resolve({ at: READ_AT, total: 0, next: null, processes: [] }),
      signal: () => undefined,
      watch: () => undefined,
      read: () => null,
      stop: () => undefined,
    },
    links: () => [],
    session: {
      start: () => Promise.resolve(),
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
      list: () => Promise.reject(new Error('not used')),
      read: () => Promise.reject(new Error('not used')),
      range: () => Promise.reject(new Error('not used')),
    },
    capture: { capture: () => Promise.reject(new Error('not used')) },
    ...unusedControls(),
    ...overrides,
  };
}

export async function guestMember(booted: Booted): Promise<string> {
  await verifiedPublicUrl(booted);
  return (await pairPhone(booted, 'member')).token;
}

export interface ComputerExtras {
  readonly ear?: EarFactory;
  readonly hosts?: readonly ComputerRuntimeHost[];
}

export interface ComputerHub {
  readonly booted: () => Booted;
  readonly pair: (windowToken?: string) => Promise<Paired>;
  readonly run: (
    paired: Paired,
    controls: ComputerControls,
    extras?: ComputerExtras,
  ) => NodeAiRuntime;
}

type Directory = Awaited<ReturnType<typeof temporaryDirectory>>;

async function pairComputer(
  booted: Booted,
  nodeDirectory: Directory,
  windowToken?: string,
): Promise<Paired> {
  const issued = await call(booted.base, windowToken ?? booted.owner, {
    method: 'POST',
    path: '/api/nodes/pairing',
    body: { url: booted.base },
  });
  const { code } = API_ENDPOINTS.pairComputerNode.response.parse(issued.body);
  const layout = nodeLayout(nodeDirectory.path);
  await pairNode({ layout, hubUrl: booted.base, code, windowToken });
  const { node } = COMPUTER_SERVICE_CONFIG.parse(JSON.parse(await readFile(layout.config, 'utf8')));
  return {
    token: node.node_token,
    deviceId: node.device_id,
    hello: await nodeIdentity(layout.computerNodeId),
  };
}

function startComputer(
  booted: Booted,
  paired: Paired,
  controls: ComputerControls,
  extras: ComputerExtras,
): NodeAiRuntime {
  const runtime = new NodeAiRuntime({
    hubUrl: booted.base,
    token: paired.token,
    deviceId: paired.deviceId,
    hello: paired.hello,
    log: testLogger('node'),
    createRuntimeHosts: (): Promise<readonly ComputerRuntimeHost[]> =>
      Promise.resolve(extras.hosts ?? []),
    ...(extras.hosts === undefined ? {} : { runtimes: extras.hosts.map((host) => host.runtime) }),
    createComputer: (link): ComputerNode =>
      new ComputerNode({
        collector: {
          hello: (): NodeHello => paired.hello,
          readers: {
            summary: (): ComputerSummary => SUMMARY,
            cpu: () => null,
            gpu: () => null,
            memory: () => null,
            disks: () => null,
            network: () => null,
            sensors: () => null,
            power: () => null,
          },
          track: (): undefined => undefined,
          stop: (): undefined => undefined,
        },
        controls,
        link,
        now: (): Date => new Date(READ_AT),
        log: testLogger('node'),
        ear: extras.ear,
      }),
    changed: (): undefined => undefined,
  });
  runtime.start();
  return runtime;
}

export function useComputerHub(): ComputerHub {
  let hub: Directory;
  let nodeDirectory: Directory;
  let booted: Booted;
  const runtimes: NodeAiRuntime[] = [];

  beforeEach(async () => {
    captureLogs();
    hub = await temporaryDirectory();
    nodeDirectory = await temporaryDirectory();
    booted = await bootServer(hub.path);
  });

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) runtime.stop();
    await booted.server.stop();
    await hub.remove();
    await nodeDirectory.remove();
  });

  return {
    booted: () => booted,
    pair: (windowToken) => pairComputer(booted, nodeDirectory, windowToken),
    run: (paired, controls, extras = {}): NodeAiRuntime => {
      const runtime = startComputer(booted, paired, controls, extras);
      runtimes.push(runtime);
      return runtime;
    },
  };
}
