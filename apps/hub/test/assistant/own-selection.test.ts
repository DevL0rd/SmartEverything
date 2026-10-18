import {
  type AiModelRow,
  DEFAULT_AI_HARNESS_PERMISSION,
  NO_PRICES,
  type DshEngine,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import { OwnEngineSelections } from '../../src/harness/own-selection';
import { HarnessRoutes } from '../../src/harness/routes';
import { HarnessService } from '../../src/harness/service';
import { Catalogue } from '../../src/openrouter/catalogue';
import { OpenRouterClient } from '../../src/openrouter/client';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

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
let ownerId: string;
let memberId: string;

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
  store.aiModels.saveSettings({ ...store.aiModels.settings(), default_model: MODEL });
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
  const routes = new HarnessRoutes(catalogue, () => true);
  selections = new OwnEngineSelections(
    new HarnessService(store, routes, () => undefined, {
      dataDirectory: opened.directory,
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
  it('gets its own profile’s route when its first turn is admitted', () => {
    const ownerRoute = selections.select(ownerId, {
      kind: 'openrouter',
      model: MODEL,
      effort: null,
    });
    if (ownerRoute.kind !== 'dsh') throw new Error('The owner route did not resolve.');
    const chatId = chatOf(memberId, ownerRoute);

    selections.migrate(chatId);

    const admitted = opened.store.aiChats.chat(chatId).engine;
    expect(admitted).toMatchObject({ kind: 'dsh' });
    expect(admitted).not.toEqual(ownerRoute);
    selections.migrate(chatId);
    expect(opened.store.aiChats.chat(chatId).engine).toEqual(admitted);
  });

  it('keeps a route its profile already has, with its target and session', () => {
    const own = selections.select(ownerId, { kind: 'openrouter', model: MODEL, effort: null });
    if (own.kind !== 'dsh') throw new Error('The owner route did not resolve.');
    const onDevice: DshEngine = {
      ...own,
      execution_target: { kind: 'device', device_id: '11111111-1111-4111-8111-111111111111' },
    };
    const chatId = chatOf(ownerId, onDevice);

    selections.migrate(chatId);

    expect(opened.store.aiChats.chat(chatId).engine).toEqual(onDevice);
  });

  it('refuses a route that belongs to no supplier it can replace', () => {
    const chatId = chatOf(ownerId, engine('00000000-0000-4000-8000-000000000000'));

    expect(() => {
      selections.migrate(chatId);
    }).toThrow('there is no account or paid fallback');
  });
});

describe('paid Claude and OpenAI models on the metered OpenRouter route', () => {
  it('can be selected like any other OpenRouter model', () => {
    const selected = selections.select(ownerId, {
      kind: 'openrouter',
      model: CLAUDE_MODEL,
      effort: null,
    });

    expect(selected).toMatchObject({ kind: 'dsh', model: CLAUDE_MODEL });
  });
});

describe('a chat on a computer engine', () => {
  it('is left alone', () => {
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

    selections.migrate(chat.id);

    expect(opened.store.aiChats.chat(chat.id).engine).toEqual(codex);
  });
});
