import { describe, expect, it } from 'vitest';
import { AI_RUNTIME_ENGINE_CATALOGUE, type ComputerAiRuntime } from '@smarteverything/domain';
import { engineCatalogue, type EngineCatalogue } from '../provider/engine-catalogue';
import { availableRuntimes, runtimeStartOf } from './runtime-start';

interface Spec {
  readonly id: string;
  readonly runtime: ComputerAiRuntime;
  readonly enabled?: boolean;
  readonly online?: boolean;
  readonly reason?: string | null;
  readonly models?: readonly string[];
}

const DEVICE = (id: string): string => `00000000-0000-4000-8000-00000000000${id}`;

function computer(spec: Spec): unknown {
  const device = DEVICE(spec.id);
  return {
    runtime: spec.runtime,
    device_id: device,
    name: `PC ${spec.id}`,
    online: spec.online ?? true,
    enabled: spec.enabled ?? true,
    reason: spec.reason ?? null,
    provider_options: {},
    capabilities: {
      runtime_version: null,
      capability_revision: 'r',
      operations: [],
      settings: [],
      control_reason: null,
      provider_reason: null,
      authentication: 'unknown',
      subscription: 'unverified',
      input_modalities: ['text'],
      local_features: {},
    },
    models: (spec.models ?? ['m1']).map((id) => ({
      runtime: spec.runtime,
      device_id: device,
      id,
      resolved_model: null,
      name: id,
      description: '',
      efforts: [],
      adaptive_thinking: false,
      fast: false,
      available: true,
      reason: null,
      input_modalities: ['text'],
    })),
  };
}

function catalogueOf(
  specs: readonly Spec[],
  preferred?: { device: string; model: string },
): EngineCatalogue {
  return engineCatalogue(
    AI_RUNTIME_ENGINE_CATALOGUE.parse({
      default: null,
      computers: specs.map(computer),
      preferences:
        preferred === undefined
          ? []
          : [{ runtime: 'claude', device_id: DEVICE(preferred.device), model: preferred.model }],
    }),
  );
}

describe('runtimeStartOf', () => {
  it('has no plus when no computer has the runtime', () => {
    expect(runtimeStartOf(catalogueOf([{ id: '1', runtime: 'codex' }]), 'claude')).toEqual({
      kind: 'none',
    });
    expect(runtimeStartOf(undefined, 'claude')).toEqual({ kind: 'none' });
    expect(
      runtimeStartOf(catalogueOf([{ id: '1', runtime: 'claude', enabled: false }]), 'claude'),
    ).toEqual({ kind: 'none' });
  });

  it('starts directly when exactly one computer is ready', () => {
    const start = runtimeStartOf(catalogueOf([{ id: '1', runtime: 'claude' }]), 'claude');
    expect(start.kind).toBe('direct');
    expect(start.kind === 'direct' ? start.engine : null).toMatchObject({
      kind: 'claude',
      device_id: DEVICE('1'),
      model: 'm1',
    });
  });

  it('ignores a computer that is offline when another one is ready', () => {
    const start = runtimeStartOf(
      catalogueOf([
        { id: '1', runtime: 'claude', online: false },
        { id: '2', runtime: 'claude' },
      ]),
      'claude',
    );
    expect(start.kind === 'direct' ? start.engine : null).toMatchObject({ device_id: DEVICE('2') });
  });

  it('opens a menu when more than one computer is ready', () => {
    const start = runtimeStartOf(
      catalogueOf([
        { id: '1', runtime: 'claude' },
        { id: '2', runtime: 'claude' },
        { id: '3', runtime: 'codex' },
      ]),
      'claude',
    );
    expect(start.kind === 'menu' ? start.choices.map((choice) => choice.name) : null).toEqual([
      'PC 1',
      'PC 2',
    ]);
  });

  it('shows why when the only computers are not ready', () => {
    const start = runtimeStartOf(
      catalogueOf([
        { id: '1', runtime: 'claude', online: false },
        { id: '2', runtime: 'claude', reason: 'Not signed in' },
      ]),
      'claude',
    );
    expect(
      start.kind === 'menu' ? start.choices.map((choice) => [choice.reason, choice.engine]) : null,
    ).toEqual([
      ['Offline', null],
      ['Not signed in', null],
    ]);
  });

  it('uses the preferred model of that computer, else the first available one', () => {
    const specs: readonly Spec[] = [{ id: '1', runtime: 'claude', models: ['a', 'b'] }];
    const preferred = runtimeStartOf(catalogueOf(specs, { device: '1', model: 'b' }), 'claude');
    expect(preferred.kind === 'direct' ? preferred.engine : null).toMatchObject({ model: 'b' });
    const fallback = runtimeStartOf(catalogueOf(specs), 'claude');
    expect(fallback.kind === 'direct' ? fallback.engine : null).toMatchObject({ model: 'a' });
  });

  it('starts a Codex chat through the same path', () => {
    const start = runtimeStartOf(catalogueOf([{ id: '4', runtime: 'codex' }]), 'codex');
    expect(start.kind === 'direct' ? start.engine : null).toMatchObject({ kind: 'codex' });
  });
});

describe('availableRuntimes', () => {
  it('counts only enabled computers', () => {
    const catalogue = catalogueOf([
      { id: '1', runtime: 'claude', enabled: false },
      { id: '2', runtime: 'codex' },
    ]);
    expect([...availableRuntimes(catalogue.computers)]).toEqual(['codex']);
  });
});
