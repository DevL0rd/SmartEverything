import { describe, expect, it } from 'vitest';
import { AI_ROUTE_INFO, AI_ROUTE_INFO_QUERY, API_ENDPOINTS } from '../src';

const ROUTE = '11111111-1111-4111-8111-111111111111';

const INFO = {
  route_id: ROUTE,
  model: 'vendor/model',
  name: 'Model',
  description: null,
  input_modalities: ['text', 'image'],
  context_window: 100_000,
  default_max_tokens: 8000,
  reasoning: {
    efforts: [
      { id: 'low', name: 'Low', description: null },
      { id: 'high', name: 'High', description: 'Thinks longer' },
    ],
    default_effort: 'low',
  },
  system_prompt_update: null,
  tool_update: 'in-history',
  permission_presets: {
    options: [{ value: 'read-only', name: 'Read only', description: null }],
    default_options: [{ value: 'read-only', name: 'Read only', description: null }],
    default_preset: 'read-only',
    custom: { value: 'custom', name: 'Custom', description: null },
  },
};

describe('the route info a model reports', () => {
  it('keeps the efforts in the order the runtime gave them', () => {
    expect(AI_ROUTE_INFO.parse(INFO).reasoning?.efforts.map((effort) => effort.id)).toEqual([
      'low',
      'high',
    ]);
  });

  it('says what is unknown with null, not with a made-up value', () => {
    const unknown = AI_ROUTE_INFO.parse({
      ...INFO,
      input_modalities: null,
      context_window: null,
      default_max_tokens: null,
      reasoning: null,
      tool_update: null,
      permission_presets: null,
    });
    expect(unknown.reasoning).toBeNull();
    expect(unknown.permission_presets).toBeNull();
  });

  it('refuses an effort without a name and any field it does not know', () => {
    expect(
      AI_ROUTE_INFO.safeParse({
        ...INFO,
        reasoning: { efforts: [{ id: 'low', description: null }], default_effort: null },
      }).success,
    ).toBe(false);
    expect(AI_ROUTE_INFO.safeParse({ ...INFO, image_budget: 3 }).success).toBe(false);
  });

  it('asks for one route and one model', () => {
    expect(AI_ROUTE_INFO_QUERY.safeParse({ route_id: ROUTE, model: 'vendor/model' }).success).toBe(
      true,
    );
    expect(AI_ROUTE_INFO_QUERY.safeParse({ route_id: 'x', model: 'vendor/model' }).success).toBe(
      false,
    );
    expect(AI_ROUTE_INFO_QUERY.safeParse({ route_id: ROUTE }).success).toBe(false);
  });

  it('is a member read on its own path', () => {
    const route = API_ENDPOINTS.readAiRouteInfo;
    expect(route).toMatchObject({
      method: 'GET',
      path: '/api/ai/harness/route-info',
      access: 'member',
    });
  });
});
