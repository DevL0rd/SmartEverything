import { afterEach, describe, expect, it } from 'vitest';
import {
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_PLATFORM,
  HARNESS_SUBSCRIPTION_CAPABILITY,
} from '@smarteverything/domain';
import { HOST_PLATFORM, hostCapabilities } from '../src/host/host-platforms';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

describe('the host platform table', () => {
  it('has exactly one entry per harness platform', () => {
    expect(Object.keys(HOST_PLATFORM).sort()).toStrictEqual([...HARNESS_PLATFORM.options].sort());
  });

  it('gives Linux and macOS bash and owner-only subscription storage', () => {
    for (const platform of ['linux', 'macos'] as const) {
      expect(HOST_PLATFORM[platform].shell).toBe('bash');
      expect(HOST_PLATFORM[platform].subscriptionStorage).toBeTypeOf('function');
      expect(HOST_PLATFORM[platform].sandbox).toBeNull();
    }
  });

  it('gives Windows PowerShell, no subscription storage and a partial sandbox', () => {
    expect(HOST_PLATFORM.windows).toStrictEqual({
      shell: 'pwsh',
      subscriptionStorage: null,
      sandbox: 'partial',
    });
  });
});

describe('the capabilities a host advertises', () => {
  it('lists configuration and subscriptions for a Linux or macOS computer', () => {
    for (const platform of ['linux', 'macos'] as const) {
      expect(hostCapabilities(platform)).toStrictEqual([
        HARNESS_CONFIGURATION_CAPABILITY,
        HARNESS_SUBSCRIPTION_CAPABILITY,
      ]);
    }
  });

  it('never advertises the subscription capability for Windows', () => {
    expect(hostCapabilities('windows')).toStrictEqual([HARNESS_CONFIGURATION_CAPABILITY]);
  });
});

describe('the shell a composed host offers', () => {
  it('mounts PowerShell and no bash on a Windows host', async () => {
    fixture = await bootRuntime({ platform: 'windows' });

    const { tools } = fixture.runtime.manifest();

    expect(tools).toContain('pwsh');
    expect(tools).not.toContain('bash');
    expect(tools).toContain('job_output');
  });

  it('mounts bash and no PowerShell on a Linux host', async () => {
    fixture = await bootRuntime({ platform: 'linux' });

    const { tools } = fixture.runtime.manifest();

    expect(tools).toContain('bash');
    expect(tools).not.toContain('pwsh');
  });
});
