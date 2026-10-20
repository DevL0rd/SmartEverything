import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { z } from 'zod';
import {
  AI_HARNESS_PERMISSIONS,
  AI_PREVIEW_CAPABILITY,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  NODE_HARNESS_PROTOCOL,
  type AiHarnessHost,
  type HarnessPlatform,
  type NodeHello,
} from '@smarteverything/domain';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { ComputerHarnessSockets } from '../../src/server/harness-socket';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { until } from '../support/wait';

const MACHINE = 'b'.repeat(32);
const HELLO: NodeHello = {
  machineId: MACHINE,
  hostname: 'laptop',
  os: { name: 'Windows', kernel: '10.0' },
  hardware: { vendor: null, product: null, portable: true },
  cpu: { model: 'CPU', threads: 4, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  features: [],
  role: 'pc',
  power: [],
  actions: [],
  permissions: [],
};
const WELCOME = z.object({
  type: z.literal('harness_welcome'),
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
});
const SUBSCRIPTION = [HARNESS_SUBSCRIPTION_CAPABILITY];
const BASE = [HARNESS_CONFIGURATION_CAPABILITY, AI_PREVIEW_CAPABILITY];

interface Bench {
  readonly rig: Rig;
  readonly logs: CapturedLogs;
  readonly sockets: ComputerHarnessSockets;
  readonly server: Server;
  readonly url: string;
  readonly token: string;
  readonly deviceId: string;
  readonly clients: WebSocket[];
}

let bench: Bench;

beforeEach(async () => {
  const logs = captureLogs();
  const rig = await harnessRig();
  const access = new ComputerNodeAccess(rig.opened.store, () => new Date());
  const { code } = access.pair('http://127.0.0.1:8788', rig.clientId);
  const { paired } = access.claim(code, HELLO, 'test');
  const sockets = new ComputerHarnessSockets(
    rig.opened.store,
    access,
    { service: rig.service, calls: (): Promise<null> => Promise.resolve(null) },
    testLogger('sockets'),
  );
  const server = createServer();
  server.on('upgrade', (request, socket, head) => {
    sockets.upgrade(request, socket, head);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The server has no port.');
  bench = {
    rig,
    logs,
    sockets,
    server,
    url: `ws://127.0.0.1:${String(address.port)}`,
    token: paired.token,
    deviceId: paired.device_id,
    clients: [],
  };
});

afterEach(async () => {
  for (const client of bench.clients) client.terminate();
  bench.sockets.stop();
  bench.server.close();
  await bench.rig.close();
});

async function connected(capabilities: readonly string[]): Promise<{
  readonly send: (frame: unknown) => void;
  readonly binding: { device_id: string; generation: string; runtime_instance: string };
}> {
  const client = new WebSocket(bench.url, NODE_HARNESS_PROTOCOL, {
    headers: { authorization: `Bearer ${bench.token}` },
  });
  bench.clients.push(client);
  const welcomed = new Promise<z.infer<typeof WELCOME>>((resolve) => {
    client.once('message', (raw: Buffer) => {
      resolve(WELCOME.parse(JSON.parse(raw.toString('utf8'))));
    });
  });
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  const send = (frame: unknown): void => {
    client.send(JSON.stringify(frame));
  };
  send({
    type: 'harness_connect',
    protocol: 1,
    device_id: bench.deviceId,
    runtime_instance: randomUUID(),
    machine_id: MACHINE,
    capabilities,
  });
  const { device_id, generation, runtime_instance } = await welcomed;
  return { send, binding: { device_id, generation, runtime_instance } };
}

function hello(
  binding: { device_id: string; generation: string; runtime_instance: string },
  platform: HarnessPlatform,
  capabilities: readonly string[],
): unknown {
  return {
    ...binding,
    type: 'harness_hello',
    protocol: 1,
    capabilities,
    manifest: {
      protocol: 1,
      revision: 'test-revision',
      features: [],
      tools: ['pwsh'],
      permission_change: true,
      permissions: [...AI_HARNESS_PERMISSIONS],
    },
    host: {
      name: 'Laptop',
      platform,
      ...(platform === 'windows' ? { sandbox: 'partial' } : {}),
      home_directory: platform === 'windows' ? 'C:\\Users\\home' : '/home/test',
    },
  };
}

function registered(): AiHarnessHost | undefined {
  return bench.rig.service.directory
    .list()
    .find((host) => host.target.kind === 'device' && host.target.device_id === bench.deviceId);
}

describe('a Windows computer saying hello to the hub', () => {
  it('is admitted as a Windows host and keeps its partial sandbox fact', async () => {
    const { send, binding } = await connected(BASE);

    send(hello(binding, 'windows', BASE));

    await until(() => registered()?.platform === 'windows', 'the Windows host to register');
    expect(registered()).toMatchObject({
      name: 'Laptop',
      platform: 'windows',
      sandbox: 'partial',
      online: true,
    });
    expect(registered()?.manifest?.subscription_inference).toBeUndefined();
  });

  it('is refused when its hello claims subscriptions its connect never asked for', async () => {
    const { send, binding } = await connected(BASE);

    send(hello(binding, 'windows', [...BASE, ...SUBSCRIPTION]));

    await until(
      () => bench.logs.events().includes('computer.frame_rejected'),
      'the hello to be rejected',
    );
    expect(registered()).toBeUndefined();
    expect(
      bench.logs.records.find((record) => record.event === 'computer.frame_rejected')?.payload,
    ).toMatchObject({
      reason: 'The computer hello repeats itself or disagrees with its connect handshake.',
    });
  });

  it('is still admitted as Linux when it keeps the subscription capability on both sides', async () => {
    const capabilities = [...BASE, ...SUBSCRIPTION];
    const { send, binding } = await connected(capabilities);

    send(hello(binding, 'linux', capabilities));

    await until(() => registered()?.platform === 'linux', 'the Linux host to register');
    expect(registered()).not.toHaveProperty('sandbox');
  });
});

describe('a Windows computer as a subscription supplier', () => {
  it('is refused even when it registers a subscription control', async () => {
    const target = { kind: 'device', device_id: randomUUID() } as const;
    bench.rig.service.directory.register({
      actor: { kind: 'node', id: target.device_id },
      host: {
        target,
        name: 'Laptop',
        online: true,
        platform: 'windows',
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
        manifest: null,
        unavailable_reason: null,
      },
      subscription: () => Promise.reject(new Error('The refused supplier must not be reached.')),
    });

    await expect(
      bench.rig.service.subscriptions.control(bench.rig.owner.profileId, {
        target,
        provider: 'claude',
        command: { kind: 'status' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
