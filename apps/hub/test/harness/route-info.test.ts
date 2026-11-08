import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_PRICES, type AiModelRow } from '@smarteverything/domain';
import { ReasoningEffortId, type LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { systemClock } from '../../src/clock';
import { HarnessRoutes } from '../../src/harness/routes';
import type { RouteInfoRuntime } from '../../src/harness/route-info';
import { Catalogue } from '../../src/openrouter/catalogue';
import { OpenRouterClient } from '../../src/openrouter/client';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const MODEL = 'qwen/qwen-test';

const ROW: AiModelRow = {
  id: MODEL,
  provider: 'openrouter',
  name: 'Qwen test',
  author: 'qwen',
  author_name: 'Qwen',
  family: 'qwen',
  description: '',
  created: '2026-10-01T00:00:00.000Z',
  context_length: 100_000,
  max_output: 8000,
  input_modalities: ['text'],
  output_modalities: ['text'],
  supported_parameters: ['tools'],
  reasoning: 'none',
  efforts: [],
  default_effort: null,
  tools: true,
  alias_of: null,
  pricing: NO_PRICES,
  kinds: ['chat'],
  expires_at: null,
  synced_at: '2026-10-08T10:00:00.000Z',
  gone_at: null,
};

const RESOLVED: LlmResolvedModelInfo = {
  provider: 'route',
  id: MODEL,
  name: 'Qwen test',
  description: 'A test model',
  inputModalities: ['text', 'image'],
  context: { contextWindow: 100_000 },
  defaultMaxTokens: 8000,
  reasoning: {
    efforts: [
      { id: ReasoningEffortId('low'), name: 'Low', description: 'Quick' },
      { id: ReasoningEffortId('high'), name: 'High' },
    ],
    defaultEffort: ReasoningEffortId('low'),
  },
  toolUpdate: 'addition-only',
};

const SPARSE: LlmResolvedModelInfo = { provider: 'route', id: MODEL, name: 'Qwen test' };

const RUNTIME: RouteInfoRuntime = {
  model: () => Promise.resolve(RESOLVED),
  presets: () => ({
    catalog: {
      options: [
        { value: 'read-only', name: 'Read only', description: 'Reads, never writes' },
        { value: 'workspace-write', name: 'Workspace write' },
      ],
      defaultOptions: [{ value: 'read-only', name: 'Read only' }],
      defaultPreset: 'read-only',
    },
    custom: { value: 'custom', name: 'Custom' },
  }),
};

let opened: TestStore;
let routes: HarnessRoutes;
let profileId: string;
let routeId: string;

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  store.aiModels.replace([ROW], 'openrouter');
  store.aiModels.saveSyncState({
    synced_at: '2026-10-08T10:00:00.000Z',
    error: null,
    error_at: null,
  });
  const catalogue = new Catalogue({
    models: store.aiModels,
    client: new OpenRouterClient({ fetch, key: (): null => null }),
    clock: systemClock,
    log: testLogger('catalogue'),
  });
  catalogue.start();
  catalogue.stop();
  routes = new HarnessRoutes(catalogue, () => true);
  profileId = store.profiles.list()[0]?.id ?? '';
  routeId = routes.list(profileId)[0]?.id ?? '';
});

afterEach(async () => {
  await opened.close();
});

describe('what the runtime reports for a route and model', () => {
  it('serves context, output size, efforts in order, modalities and the permission presets', async () => {
    routes.attachInfo(RUNTIME);

    const info = await routes.info(profileId, { route_id: routeId, model: MODEL });

    expect(info).toEqual({
      route_id: routeId,
      model: MODEL,
      name: 'Qwen test',
      description: 'A test model',
      input_modalities: ['text', 'image'],
      context_window: 100_000,
      default_max_tokens: 8000,
      reasoning: {
        efforts: [
          { id: 'low', name: 'Low', description: 'Quick' },
          { id: 'high', name: 'High', description: null },
        ],
        default_effort: 'low',
      },
      system_prompt_update: null,
      tool_update: 'addition-only',
      permission_presets: {
        options: [
          { value: 'read-only', name: 'Read only', description: 'Reads, never writes' },
          { value: 'workspace-write', name: 'Workspace write', description: null },
        ],
        default_options: [{ value: 'read-only', name: 'Read only', description: null }],
        default_preset: 'read-only',
        custom: { value: 'custom', name: 'Custom', description: null },
      },
    });
  });

  it('says nothing is known when the route reports nothing', async () => {
    routes.attachInfo({ ...RUNTIME, model: () => Promise.resolve(SPARSE) });

    const info = await routes.info(profileId, { route_id: routeId, model: MODEL });

    expect(info).toMatchObject({
      description: null,
      input_modalities: null,
      context_window: null,
      default_max_tokens: null,
      reasoning: null,
      system_prompt_update: null,
      tool_update: null,
    });
  });

  it('refuses before the runtime is up, for a route that is not the caller’s and for a model it does not offer', async () => {
    await expect(routes.info(profileId, { route_id: routeId, model: MODEL })).rejects.toThrow(
      'starting',
    );
    routes.attachInfo(RUNTIME);
    await expect(
      routes.info(profileId, { route_id: '00000000-0000-4000-8000-000000000000', model: MODEL }),
    ).rejects.toThrow('does not exist');
    await expect(routes.info(profileId, { route_id: routeId, model: 'no/such' })).rejects.toThrow(
      'not offered',
    );
  });

  it('refuses once the runtime detaches', async () => {
    const detach = routes.attachInfo(RUNTIME);
    detach();

    await expect(routes.info(profileId, { route_id: routeId, model: MODEL })).rejects.toThrow(
      'starting',
    );
  });
});
