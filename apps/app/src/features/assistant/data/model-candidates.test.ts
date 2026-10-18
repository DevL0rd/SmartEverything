import { describe, expect, it } from 'vitest';
import type { ModelChoice } from '../picker/model-choice';
import { mergeCandidates, type ModelCandidate } from './model-candidates';

function candidate(
  key: string,
  id: string,
  extra: Partial<ModelCandidate> = {},
  supplier?: ModelChoice['catalogueSupplier'],
): ModelCandidate {
  return {
    key,
    model: {
      id,
      name: id,
      provider: 'p',
      providerLabel: 'Maker',
      contextLength: null,
      price: { inputPerMillion: null, outputPerMillion: null, variable: false },
      efforts: [],
      latest: false,
      inputs: [],
      outputs: [],
      ...(supplier === undefined ? {} : { catalogueSupplier: supplier }),
    },
    selected: false,
    favourite: false,
    render: () => null,
    pick: null,
    ...extra,
  };
}

describe('mergeCandidates', () => {
  it('is the union of native, routes and catalogue in that order', () => {
    const native = [candidate('n1', 'claude-sonnet')];
    const routes = [candidate('r1', 'gpt-5')];
    const catalogue = [candidate('c1', 'gemini-flash', {}, 'openrouter')];
    expect(mergeCandidates({ native, routes, catalogue }).map((row) => row.key)).toEqual([
      'n1',
      'r1',
      'c1',
    ]);
  });

  it('drops a catalogue row already offered by a route', () => {
    const routes = [candidate('r1', 'anthropic/claude', {}, 'openrouter')];
    const catalogue = [
      candidate('c1', 'anthropic/claude', {}, 'openrouter'),
      candidate('c2', 'anthropic/claude', {}, 'google'),
    ];
    expect(mergeCandidates({ native: [], routes, catalogue }).map((row) => row.key)).toEqual([
      'r1',
      'c2',
    ]);
  });
});
