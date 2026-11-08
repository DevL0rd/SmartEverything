import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_HARNESS_PERMISSION, type Engine } from '@smarteverything/domain';

const { memoryModelEngine } = await import('./memory-model-row');

const BASE: Engine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '6f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  model: 'openai/gpt-6-luna',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

describe('the memory manager model', () => {
  it('opens the library on the stored slug as written', () => {
    expect(memoryModelEngine(BASE, '~deepseek/deepseek-flash-latest').model).toBe(
      '~deepseek/deepseek-flash-latest',
    );
  });
});
