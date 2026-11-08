import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  type AiRouteInfo,
  type Engine,
} from '@smarteverything/domain';
import { routeChoiceOf, routeFacts, routeInfoKey } from './route-info';

const ROUTE = '6f1c2d3e-4b5a-4c6d-8e7f-901234567890';

const INFO: AiRouteInfo = {
  route_id: ROUTE,
  model: 'deepseek/deepseek-v4',
  name: 'DeepSeek V4',
  description: null,
  input_modalities: ['text', 'image'],
  context_window: 1_048_576,
  default_max_tokens: 32_768,
  reasoning: null,
  system_prompt_update: null,
  tool_update: null,
  permission_presets: null,
};

const DSH: Engine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: ROUTE,
  model: 'deepseek/deepseek-v4',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

describe('route info for a chat engine', () => {
  it('asks for the route and model of a harness engine only', () => {
    expect(routeChoiceOf(DSH)).toEqual({ route_id: ROUTE, model: 'deepseek/deepseek-v4' });
    expect(
      routeChoiceOf({
        kind: 'codex',
        device_id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
        model: 'gpt-5',
        effort: null,
        settings: {},
      }),
    ).toBeNull();
  });

  it('keeps one cache entry per route and model', () => {
    const choice = routeChoiceOf(DSH);
    expect(routeInfoKey(choice)).toEqual(['ai-route-info', ROUTE, 'deepseek/deepseek-v4']);
    expect(routeInfoKey(null)).toEqual(['ai-route-info', null, null]);
  });
});

describe('model facts', () => {
  it('lists the context window, output size and image input the route reports', () => {
    expect(routeFacts(INFO)).toEqual(['1M context', '33K output tokens', 'reads images']);
  });

  it('leaves out what the route does not say', () => {
    expect(
      routeFacts({
        ...INFO,
        context_window: 128_000,
        default_max_tokens: null,
        input_modalities: ['text'],
      }),
    ).toEqual(['128K context']);
    expect(routeFacts({ ...INFO, context_window: null, input_modalities: null })).toEqual([
      '33K output tokens',
    ]);
    expect(routeFacts(undefined)).toEqual([]);
  });

  it('words small and large output sizes the same way', () => {
    expect(
      routeFacts({
        ...INFO,
        context_window: null,
        input_modalities: null,
        default_max_tokens: 800,
      }),
    ).toEqual(['800 output tokens']);
  });
});
