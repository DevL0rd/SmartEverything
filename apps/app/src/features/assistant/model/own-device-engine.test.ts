import { describe, expect, it } from 'vitest';
import {
  AI_HARNESS_HOST,
  AI_MODEL_ROUTE,
  ENGINE,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type Engine,
} from '@smarteverything/domain';
import { ownDeviceEngine } from './own-device-engine';

const DEVICE = '0b3f4c1e-5d7a-4e0b-9a41-6a6d2f0c8a11';
const ROUTE = '0e000000-0000-4000-8000-0000000000a1';
const UUID = '0e000000-0000-4000-8000-0000000000b2';

const HOST: AiHarnessHost = AI_HARNESS_HOST.parse({
  target: { kind: 'device', device_id: DEVICE },
  name: 'Workstation',
  online: true,
  runtime_instance: UUID,
  connection_generation: UUID,
  manifest: {
    protocol: 1,
    references: { protocol: 1 },
    human_commands: true,
    delivery_correlation: true,
    revision: 'r1',
    features: [],
    tools: [],
    permissions: [
      { sandbox: 'danger-full-access', approval: 'never' },
      { sandbox: 'read-only', approval: 'on-request' },
    ],
  },
  workspace: { home_directory: '/home/a', default_directory: null, available: true, reason: null },
  unavailable_reason: null,
  platform: 'linux',
});

function catalogue(state: 'ready' | 'unavailable'): AiHarnessCatalogue {
  const route = {
    id: ROUTE,
    profile_id: UUID,
    supplier: { kind: 'server' },
    subscriber_id: 's',
    auth: { provider: 'openrouter', kind: 'hub-api-key' },
    billing: 'metered',
    fallback: 'none',
    background_authorized: true,
    capability_revision: 'r',
    models: [
      {
        id: 'vendor/model',
        name: 'Model',
        capabilities: {
          revision: 'r',
          input_modalities: ['text'],
          output_modalities: ['text'],
          reasoning: true,
          efforts: ['low', 'high'],
          local_tools: true,
          context_tokens: 1000,
          discovered_at: '2026-10-08T09:00:00.000Z',
        },
      },
    ],
  };
  return {
    capability: 'ai-harness-v1',
    hosts: [HOST],
    routes: [
      AI_MODEL_ROUTE.parse(
        state === 'ready'
          ? { ...route, state }
          : {
              ...route,
              state,
              failure: { code: 'route_unavailable', message: 'No key', retry_at: null },
            },
      ),
    ],
  };
}

function metered(effort: string | null): Engine {
  return ENGINE.parse({
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: ROUTE,
    model: 'vendor/model',
    effort,
  });
}

describe('moving a metered chat to the machine the person chose', () => {
  it('keeps the route, model and effort and changes only the machine', () => {
    expect(ownDeviceEngine(metered('high'), HOST, { catalogue: catalogue('ready') })).toMatchObject(
      {
        kind: 'dsh',
        execution_target: { kind: 'device', device_id: DEVICE },
        model_route_id: ROUTE,
        model: 'vendor/model',
        effort: 'high',
      },
    );
  });

  it('applies the permission the person asked for when the machine offers it', () => {
    const permission = { sandbox: 'read-only', approval: 'on-request' } as const;
    expect(
      ownDeviceEngine(metered(null), HOST, { catalogue: catalogue('ready'), permission }),
    ).toMatchObject({ permission });
  });

  it('refuses a permission the machine does not offer', () => {
    const permission = { sandbox: 'workspace-write', approval: 'on-request' } as const;
    expect(
      ownDeviceEngine(metered(null), HOST, { catalogue: catalogue('ready'), permission }),
    ).toBeNull();
  });

  it('refuses while the route is unavailable or lacks the effort', () => {
    expect(
      ownDeviceEngine(metered(null), HOST, { catalogue: catalogue('unavailable') }),
    ).toBeNull();
    expect(ownDeviceEngine(metered('max'), HOST, { catalogue: catalogue('ready') })).toBeNull();
  });

  it('leaves a subscription computer engine alone', () => {
    const claude = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'opus' });
    expect(ownDeviceEngine(claude, HOST, { catalogue: catalogue('ready') })).toBeNull();
  });
});
