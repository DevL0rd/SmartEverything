import { AI_RUNTIME_ENGINE_CATALOGUE, ENGINE, NATIVE_DEFAULT_MODEL } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { nativeDraftEngine } from './draft-native';

vi.mock('../provider/subscription-models', () => ({
  nativeSupplyOptionReason: vi.fn().mockReturnValue(null),
  nativeSupplyEngine: ({
    computer,
    model,
  }: {
    readonly computer: { readonly runtime: string; readonly device_id: string };
    readonly model: { readonly id: string };
  }): ReturnType<typeof ENGINE.parse> =>
    ENGINE.parse({ kind: computer.runtime, device_id: computer.device_id, model: model.id }),
}));

const COMPUTER = '00000000-0000-4000-8000-000000000001';
const DEFAULT = ENGINE.parse({ kind: 'claude', device_id: COMPUTER, model: NATIVE_DEFAULT_MODEL });

describe.each(['claude', 'codex'] as const)('%s draft engine selection', (runtime) => {
  it.each([null, 'Cached usage is exhausted.', 'Usage is unknown.'])(
    'chooses a discovered model regardless of provider status %s',
    (reason) => {
      const model = {
        runtime,
        input_modalities: ['text'],
        device_id: COMPUTER,
        id: 'discovered',
        name: 'Discovered',
        description: '',
        resolved_model: null,
        efforts: [],
        adaptive_thinking: false,
        fast: false,
        available: reason === null,
        reason,
      };
      const computer = AI_RUNTIME_ENGINE_CATALOGUE.shape.computers.element.parse({
        runtime,
        device_id: COMPUTER,
        name: 'Desk',
        online: reason === null,
        enabled: true,
        reason,
        provider_options: {},
        capabilities: {
          runtime_version: null,
          capability_revision: '1',
          operations: [],
          settings: [],
          control_reason: null,
          provider_reason: reason,
          authentication: 'unknown',
          subscription: 'unverified',
          input_modalities: ['text'],
          local_features: {},
        },
        models: [model],
      });
      const catalogue = { default: DEFAULT, computers: [computer], preferences: [] };
      expect(nativeDraftEngine(catalogue, computer, DEFAULT)).toMatchObject({
        kind: runtime,
        device_id: COMPUTER,
        model: 'discovered',
      });
    },
  );

  it('chooses the provider default when the computer has no catalogue', () => {
    const computer = AI_RUNTIME_ENGINE_CATALOGUE.shape.computers.element.parse({
      runtime,
      device_id: COMPUTER,
      name: 'Desk',
      online: false,
      enabled: false,
      reason: 'The provider has not been configured.',
      provider_options: {},
      capabilities: {
        runtime_version: null,
        capability_revision: '1',
        operations: [],
        settings: [],
        control_reason: null,
        provider_reason: null,
        authentication: 'unknown',
        subscription: 'unverified',
        input_modalities: [],
        local_features: {},
      },
      models: [],
    });
    const catalogue = { default: DEFAULT, computers: [computer], preferences: [] };
    expect(nativeDraftEngine(catalogue, computer, DEFAULT)).toMatchObject({
      kind: runtime,
      device_id: COMPUTER,
      model: NATIVE_DEFAULT_MODEL,
    });
  });
});
