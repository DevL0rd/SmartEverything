import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AI_PREVIEW_CAPABILITY,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  type AiModelRoute,
  type HarnessPlatform,
} from '@smarteverything/domain';
import { createComputerHarness, type ComputerHarness } from '../src/process/computer';
import type { NativePreviewAdapter } from '../src/process/preview-tools';
import { HarnessRuntimeError } from '../src/host/errors';

const PREVIEW: NativePreviewAdapter = {
  publish: () => Promise.reject(new Error('The test host publishes no previews.')),
  forget: (): void => undefined,
  registerFile: (): void => undefined,
  reportFileFailure: (): void => undefined,
};

function route(): AiModelRoute {
  const profile = randomUUID();
  return {
    id: randomUUID(),
    profile_id: profile,
    supplier: { kind: 'server' },
    subscriber_id: profile,
    auth: { provider: 'anthropic', kind: 'claude-subscription-oauth' },
    billing: 'subscription-only',
    fallback: 'none',
    background_authorized: true,
    capability_revision: 'caps-1',
    state: 'ready',
    models: [],
  };
}

let directory: string;
let harness: ComputerHarness | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'computer-platform-'));
});

afterEach(async () => {
  await harness?.stop();
  harness = undefined;
  await rm(directory, { recursive: true, force: true });
});

async function compose(platform: HarnessPlatform): Promise<ComputerHarness> {
  harness = await createComputerHarness(
    {
      type: 'harness_boot',
      protocol: 1,
      device_id: randomUUID(),
      generation: randomUUID(),
      runtime_instance: randomUUID(),
      name: 'Desk',
      hub_url: 'http://127.0.0.1:1',
      token: 'token',
      home_directory: directory,
      state_directory: join(directory, 'state'),
      platform,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    },
    {
      call: (request) =>
        request.operation === 'tools'
          ? Promise.resolve([])
          : Promise.reject(new Error(`The test hub does not answer ${request.operation}.`)),
    },
    { preview: PREVIEW },
  );
  return harness;
}

describe('a Windows computer harness', () => {
  it('composes without opening subscription storage', async () => {
    await compose('windows');

    await expect(stat(join(directory, 'state', 'subscriptions'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('says it is a Windows host with a partial sandbox and a PowerShell shell', async () => {
    const { hello } = await compose('windows');

    expect(hello.host).toStrictEqual({
      name: 'Desk',
      platform: 'windows',
      sandbox: 'partial',
      home_directory: directory,
    });
    expect(hello.manifest.tools).toContain('pwsh');
    expect(hello.manifest.tools).not.toContain('bash');
  });

  it('advertises neither the subscription capability nor subscription supply', async () => {
    const { hello } = await compose('windows');

    expect(hello.capabilities).toContain(HARNESS_CONFIGURATION_CAPABILITY);
    expect(hello.capabilities).toContain(AI_PREVIEW_CAPABILITY);
    expect(hello.capabilities).not.toContain(HARNESS_SUBSCRIPTION_CAPABILITY);
    expect(hello.manifest.subscription_inference).toBeUndefined();
    expect(hello.manifest.subscription_consumer).toStrictEqual({ protocol: 1 });
  });

  it('refuses subscription control and supplier inference as unsupported', async () => {
    const computer = await compose('windows');

    const control = computer.subscription({
      profile_id: randomUUID(),
      route_id: randomUUID(),
      provider: 'claude',
      command: { kind: 'status' },
    });
    const stream = computer.inference(
      randomUUID(),
      { kind: 'resolve', route: route(), model: 'model-a' },
      () => Promise.resolve(),
    );

    await expect(control).rejects.toMatchObject({ code: 'capability_unsupported' });
    await expect(stream).rejects.toBeInstanceOf(HarnessRuntimeError);
    expect(() => {
      computer.inferenceCancel('call');
    }).toThrow(HarnessRuntimeError);
    await expect(computer.reconnectSubscriptions()).resolves.toBeUndefined();
  });
});

describe('a Linux computer harness', () => {
  it('opens subscription storage, advertises supply and keeps bash', async () => {
    const { hello } = await compose('linux');

    expect(await readdir(join(directory, 'state'))).toContain('subscriptions');
    expect(hello.capabilities).toContain(HARNESS_SUBSCRIPTION_CAPABILITY);
    expect(hello.manifest.subscription_inference).toStrictEqual({ protocol: 1 });
    expect(hello.host).not.toHaveProperty('sandbox');
    expect(hello.manifest.tools).toContain('bash');
    expect(hello.manifest.tools).not.toContain('pwsh');
  });
});
