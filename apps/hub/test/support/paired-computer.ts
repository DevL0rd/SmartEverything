import { readFile } from 'node:fs/promises';
import {
  API_ENDPOINTS,
  COMPUTER_SERVICE_CONFIG,
  type ComputerSummary,
  type NodeHello,
} from '@smarteverything/domain';
import { afterEach, beforeEach } from 'vitest';
import { NodeRouteAuthority } from '../../src/client-network/route-authority';
import { nodeHubTransport, type NodeHubTransport } from '../../src/client-network/node-transport';
import type { NetworkEventBus } from '../../src/client-network/route-events';
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
import { MemoryNetwork } from './memory-mdns';
import { call, freePort, temporaryDirectory } from './server';

export interface Paired {
  readonly token: string;
  readonly deviceId: string;
  readonly hello: NodeHello;
  readonly hubUrl: string;
  readonly transport: NodeHubTransport;
}

const LAN_HOST = '127.0.0.2';

const LAN_INTERFACES = {
  lan: [
    {
      address: LAN_HOST,
      netmask: '255.0.0.0',
      family: 'IPv4',
      mac: '02:00:00:00:00:02',
      internal: false,
      cidr: `${LAN_HOST}/8`,
    },
  ],
} as const;

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

export interface SecureHub {
  readonly booted: Booted;
  readonly hubUrl: string;
}

export async function bootSecureHub(directory: string): Promise<SecureHub> {
  const port = await freePort();
  const booted = await bootServer(directory, {
    lan: { port, host: LAN_HOST, advertise: false },
    interfaces: LAN_INTERFACES,
  });
  return { booted, hubUrl: `https://${LAN_HOST}:${String(port)}` };
}

function quietBus(): NetworkEventBus {
  return {
    call: () => Promise.resolve(['/fake']),
    watch: () => Promise.resolve(() => undefined),
    onError: () => undefined,
    close: () => undefined,
  };
}

interface Pairing {
  readonly booted: Booted;
  readonly hubUrl: string;
  readonly nodeDirectory: Directory;
  readonly authorities: NodeRouteAuthority[];
}

async function pairComputer(pairing: Pairing, windowToken?: string): Promise<Paired> {
  const { booted, hubUrl } = pairing;
  const issued = await call(booted.base, windowToken ?? booted.owner, {
    method: 'POST',
    path: '/api/nodes/pairing',
    body: { url: hubUrl },
  });
  const { code, pin } = API_ENDPOINTS.pairComputerNode.response.parse(issued.body);
  const layout = nodeLayout(pairing.nodeDirectory.path);
  await pairNode({ layout, hubUrl, code, pin: pin ?? undefined, windowToken });
  const { node } = COMPUTER_SERVICE_CONFIG.parse(JSON.parse(await readFile(layout.config, 'utf8')));
  const authority = new NodeRouteAuthority({
    hubUrl: node.hub_url,
    token: node.node_token,
    deviceId: node.device_id,
    directory: layout.nodeRoute,
    log: testLogger('node-route'),
    bus: quietBus,
    mdns: new MemoryNetwork().host('192.0.2.2'),
  });
  pairing.authorities.push(authority);
  await authority.start();
  return {
    token: node.node_token,
    deviceId: node.device_id,
    hello: await nodeIdentity(layout.computerNodeId),
    hubUrl: node.hub_url,
    transport: nodeHubTransport(authority, node.hub_url),
  };
}

function startComputer(
  paired: Paired,
  controls: ComputerControls,
  extras: ComputerExtras,
): NodeAiRuntime {
  const runtime = new NodeAiRuntime({
    hubUrl: paired.hubUrl,
    transport: paired.transport,
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
  let hubUrl: string;
  const runtimes: NodeAiRuntime[] = [];
  const authorities: NodeRouteAuthority[] = [];

  beforeEach(async () => {
    captureLogs();
    hub = await temporaryDirectory();
    nodeDirectory = await temporaryDirectory();
    ({ booted, hubUrl } = await bootSecureHub(hub.path));
  });

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) runtime.stop();
    for (const authority of authorities.splice(0)) await authority.stop();
    await booted.server.stop();
    await hub.remove();
    await nodeDirectory.remove();
  });

  return {
    booted: () => booted,
    pair: (windowToken) =>
      pairComputer({ booted, hubUrl, nodeDirectory, authorities }, windowToken),
    run: (paired, controls, extras = {}): NodeAiRuntime => {
      const runtime = startComputer(paired, controls, extras);
      runtimes.push(runtime);
      return runtime;
    },
  };
}
