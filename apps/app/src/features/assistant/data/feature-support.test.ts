import { describe, expect, it } from 'vitest';
import { AI_HARNESS_HOST, type AiHarnessHost } from '@smarteverything/domain';
import { runtimeFeatureSupported } from './feature-support';

type Manifest = NonNullable<AiHarnessHost['manifest']>;

function manifestOf(overrides: Partial<Manifest>): unknown {
  return {
    protocol: 1,
    revision: 'r1',
    composition: {
      dsh_version: '1',
      runtime_version: '1',
      session_format: 1,
      preset: 'default',
      fingerprint: 'f',
      event_vocabulary: [],
    },
    features: [],
    tools: [],
    permissions: [{ sandbox: 'workspace-write', approval: 'on-request' }],
    ...overrides,
  };
}

function host(manifest: unknown): AiHarnessHost {
  return AI_HARNESS_HOST.parse({
    target: { kind: 'server' },
    name: 'Home Hub',
    online: true,
    runtime_instance: '00000000-0000-4000-8000-000000000001',
    connection_generation: '00000000-0000-4000-8000-000000000002',
    unavailable_reason: null,
    platform: 'linux',
    manifest,
  });
}

describe('runtimeFeatureSupported', () => {
  it('reads agent support from the remote-subagents feature', () => {
    expect(runtimeFeatureSupported('agents', host(manifestOf({ features: ['text'] })))).toBe(false);
    expect(
      runtimeFeatureSupported('agents', host(manifestOf({ features: ['remote-subagents'] }))),
    ).toBe(true);
  });

  it('is unsupported without a host or a manifest', () => {
    expect(runtimeFeatureSupported('agents', undefined)).toBe(false);
    expect(runtimeFeatureSupported('agents', host(null))).toBe(false);
  });
});
