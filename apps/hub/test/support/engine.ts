import {
  DEFAULT_AI_HARNESS_PERMISSION,
  type DshEngine,
  type Engine,
} from '@smarteverything/domain';

type ClaudeEngine = Extract<Engine, { readonly kind: 'claude' }>;

export const TEST_ENGINE: DshEngine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '5b0f8f64-6a4b-5c53-8f0e-6f0b1f4a2c11',
  model: 'google/gemini-test',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

export const CLAUDE_TEST_ENGINE: ClaudeEngine = {
  kind: 'claude',
  device_id: '11111111-1111-4111-8111-111111111111',
  model: 'opus',
  effort: null,
  settings: { builtin_tools: [] },
};
