import {
  AI_MODEL_ROUTE,
  type AiHarnessTarget,
  type AiModelRoute,
  type AiModelRow,
  DEFAULT_AI_HARNESS_PERMISSION,
  DSH_ENGINE_REQUEST,
  NO_PRICES,
  type DshEngine,
  type Engine,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import { OwnEngineSelections } from '../../src/harness/own-selection';
import { HarnessRoutes } from '../../src/harness/routes';
import { HarnessService } from '../../src/harness/service';
import { subscriptionRouteId } from '../../src/harness/subscriptions';
import { Catalogue } from '../../src/openrouter/catalogue';
import {
  completeEngine,
  defaultEngine,
  meteredCatalogue,
} from '../../src/openrouter/metered-engine';
import { OpenRouterClient } from '../../src/openrouter/client';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const MODEL = 'qwen/qwen-test';
const CLAUDE_MODEL = 'anthropic/claude-test';

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

const CLAUDE_ROW: AiModelRow = {
  ...ROW,
  id: CLAUDE_MODEL,
  name: 'Claude test',
  author: 'anthropic',
  author_name: 'Anthropic',
  family: 'claude',
};

let opened: TestStore;
let selections: OwnEngineSelections;
let routes: HarnessRoutes;
let ownerId: string;
let memberId: string;

function select(profileId: string, model: string): Engine {
  return completeEngine(
    profileId,
    DSH_ENGINE_REQUEST.parse({ kind: 'dsh', model }),
    meteredCatalogue(opened.store),
  );
}

function engine(route: string): DshEngine {
  return {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: route,
    model: MODEL,
    effort: null,
    permission: DEFAULT_AI_HARNESS_PERMISSION,
  };
}

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  store.aiModels.replace([ROW, CLAUDE_ROW], 'openrouter');
  store.aiModels.saveSyncState({
    synced_at: '2026-10-08T10:00:00.000Z',
    error: null,
    error_at: null,
  });
  const catalogue = new Catalogue({
    models: store.live.aiModels,
    client: new OpenRouterClient({ fetch, key: (): null => null }),
    clock: systemClock,
    log: testLogger('catalogue'),
  });
  await catalogue.start();
  catalogue.stop();
  routes = new HarnessRoutes(catalogue, () => true);
  selections = new OwnEngineSelections(
    new HarnessService(store, routes, () => undefined, {
      layout: hubLayout(opened.directory, {}),
      clock: systemClock,
    }),
  );
  ownerId = store.profiles.list()[0]?.id ?? '';
  memberId = store.profiles.create({ name: 'Guest' }).id;
});

afterEach(async () => {
  await opened.close();
});

function chatOf(profileId: string, stored: DshEngine): string {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: stored,
  }).id;
}

describe('a dsh chat carrying another profile’s model route', () => {
  it('gets its own profile’s route when its first turn is admitted', async () => {
    const ownerRoute = select(ownerId, MODEL);
    if (ownerRoute.kind !== 'dsh') throw new Error('The owner route did not resolve.');
    const chatId = chatOf(memberId, ownerRoute);

    await selections.migrate(chatId);

    const admitted = opened.store.aiChats.chat(chatId).engine;
    expect(admitted).toMatchObject({ kind: 'dsh' });
    expect(admitted).not.toEqual(ownerRoute);
    await selections.migrate(chatId);
    expect(opened.store.aiChats.chat(chatId).engine).toEqual(admitted);
  });

  it('keeps a route its profile already has, with its target and session', async () => {
    const own = select(ownerId, MODEL);
    if (own.kind !== 'dsh') throw new Error('The owner route did not resolve.');
    const onDevice: DshEngine = {
      ...own,
      execution_target: { kind: 'device', device_id: '11111111-1111-4111-8111-111111111111' },
    };
    const chatId = chatOf(ownerId, onDevice);

    await selections.migrate(chatId);

    expect(opened.store.aiChats.chat(chatId).engine).toEqual(onDevice);
  });

  it('refuses a route that belongs to no supplier it can replace', async () => {
    const chatId = chatOf(ownerId, engine('00000000-0000-4000-8000-000000000000'));

    await expect(selections.migrate(chatId)).rejects.toThrow(
      'there is no account or paid fallback',
    );
  });
});

describe('a subscription chat after a Hub restart', () => {
  function pairComputer(): AiHarnessTarget {
    const [row] = opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'computer:machine-1',
        parentId: null,
        kind: 'computer',
        name: 'Workstation',
        model: 'm',
        manufacturer: 'm',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    if (row === undefined) throw new Error('The computer device was not stored.');
    opened.store.computerNodes.bind({
      deviceId: row.id,
      machineId: 'machine-1',
      tokenHash: 'node-hash',
      hubUrl: 'https://hub.example',
      windowClientId: null,
    });
    return { kind: 'device', device_id: row.id };
  }

  function subscriptionRoute(target: AiHarnessTarget, id: string): AiModelRoute {
    return AI_MODEL_ROUTE.parse({
      id,
      profile_id: ownerId,
      supplier: target,
      subscriber_id: ownerId,
      auth: { provider: 'anthropic', kind: 'claude-subscription-oauth' },
      billing: 'subscription-only',
      fallback: 'none',
      background_authorized: true,
      capability_revision: 'r1',
      models: [
        {
          id: MODEL,
          name: 'Claude',
          capabilities: {
            revision: 'r1',
            input_modalities: ['text'],
            output_modalities: ['text'],
            reasoning: false,
            efforts: [],
            default_effort: null,
            local_tools: true,
            context_tokens: null,
            max_output_tokens: null,
            discovered_at: '2026-10-08T10:00:00.000Z',
          },
        },
      ],
      state: 'ready',
    });
  }

  it('waits for its computer’s route report instead of failing, then keeps its route', async () => {
    const target = pairComputer();
    const routeId = subscriptionRouteId(ownerId, target, 'claude');
    const stored = engine(routeId);
    const chatId = chatOf(ownerId, stored);
    let settled = false;

    const migrated = selections.migrate(chatId).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    routes.report(target, [routeId]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    routes.publish(subscriptionRoute(target, routeId));
    await migrated;

    expect(opened.store.aiChats.chat(chatId).engine).toEqual(stored);
  });

  it('fails with model_unavailable once its computer reported without the route', async () => {
    const target = pairComputer();
    const chatId = chatOf(ownerId, engine(subscriptionRouteId(ownerId, target, 'claude')));

    const migrated = selections.migrate(chatId);
    await new Promise((resolve) => setImmediate(resolve));
    routes.report(target, []);

    await expect(migrated).rejects.toMatchObject({ reason: 'model_unavailable' });
  });
});

describe('paid Claude and OpenAI models on the metered OpenRouter route', () => {
  it('can be selected like any other OpenRouter model', () => {
    const selected = select(ownerId, CLAUDE_MODEL);

    expect(selected).toMatchObject({ kind: 'dsh', model: CLAUDE_MODEL });
  });

  it('leaves a chosen model to its provider default and keeps the configured new-chat effort', async () => {
    await opened.store.live.aiModels.replace(
      [{ ...ROW, reasoning: 'optional', efforts: ['low', 'high'], default_effort: 'high' }],
      'openrouter',
    );
    expect(select(ownerId, MODEL)).toMatchObject({ kind: 'dsh', model: MODEL, effort: null });
    expect(defaultEngine(opened.store, ownerId)).toMatchObject({ kind: 'dsh', effort: 'low' });
  });
});

describe('a chat on a computer engine', () => {
  it('is left alone', async () => {
    const codex = {
      kind: 'codex',
      device_id: '11111111-1111-4111-8111-111111111111',
      model: 'gpt',
      effort: null,
      settings: {},
    } as const;
    const chat = opened.store.aiChats.create({
      profileId: ownerId,
      kind: 'chat',
      title: 'Chat',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: codex,
    });

    await selections.migrate(chat.id);

    expect(opened.store.aiChats.chat(chat.id).engine).toEqual(codex);
  });
});
