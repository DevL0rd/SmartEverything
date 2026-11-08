import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_DEFAULT_MODEL,
  AI_RUNTIME_ENGINE_CATALOGUE,
  DEFAULT_AI_HARNESS_PERMISSION,
  DSH_ENGINE_REQUEST,
  NO_PRICES,
  type AiModelRow,
} from '@smarteverything/domain';
import { EngineSelections } from '../../src/assistant/engine-selections';
import { ComputerAiDirectory } from '../../src/computers/ai-directory';
import { meteredRouteId } from '../../src/openrouter/metered-engine';
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

let opened: TestStore;
let selections: EngineSelections;
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  store.aiModels.replace([ROW], 'openrouter');
  selections = new EngineSelections(
    store,
    new ComputerAiDirectory(store, testLogger('computers')),
    testLogger('selections'),
  );
  ownerId = store.profiles.list()[0]?.id ?? '';
  memberId = store.profiles.create({ name: 'Guest' }).id;
});

afterEach(async () => {
  selections.stop();
  await opened.close();
});

describe('selecting an engine from a request', () => {
  it('puts a model request on the person’s own metered route on the hub', () => {
    const selected = selections.select(
      ownerId,
      DSH_ENGINE_REQUEST.parse({ kind: 'dsh', model: MODEL }),
    );

    expect(selected).toEqual({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: meteredRouteId(ownerId),
      model: MODEL,
      effort: null,
      permission: DEFAULT_AI_HARNESS_PERMISSION,
    });
  });

  it('keeps the machine and permission the request names', () => {
    const device = '11111111-1111-4111-8111-111111111111';
    const selected = selections.select(
      ownerId,
      DSH_ENGINE_REQUEST.parse({
        kind: 'dsh',
        model: MODEL,
        execution_target: { kind: 'device', device_id: device },
        permission: { sandbox: 'read-only', approval: 'on-request' },
      }),
    );

    expect(selected).toMatchObject({
      execution_target: { kind: 'device', device_id: device },
      permission: { sandbox: 'read-only', approval: 'on-request' },
      model_route_id: meteredRouteId(ownerId),
    });
  });

  it('refuses a model the hub does not know', () => {
    expect(() =>
      selections.select(ownerId, DSH_ENGINE_REQUEST.parse({ kind: 'dsh', model: 'no/such' })),
    ).toThrow('doesn’t know a model');
  });

  it('passes a complete engine through unchanged', () => {
    const complete = DSH_ENGINE_REQUEST.parse({
      kind: 'dsh',
      model_route_id: meteredRouteId(memberId),
      model: MODEL,
    });

    expect(selections.select(memberId, complete)).toMatchObject({
      model_route_id: meteredRouteId(memberId),
      model: MODEL,
    });
  });
});

describe('the default engine in the catalogue', () => {
  it('is the owner’s metered route on the default model until the owner picks another', () => {
    const catalogue = AI_RUNTIME_ENGINE_CATALOGUE.parse(selections.catalogue(ownerId, 'owner'));

    expect(catalogue.default).toMatchObject({
      kind: 'dsh',
      model: AI_DEFAULT_MODEL,
      model_route_id: meteredRouteId(ownerId),
    });
  });

  it('is the member’s own metered route, never the owner’s choice', () => {
    opened.store.aiEngineDefaults.update({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: meteredRouteId(ownerId),
      model: 'other/model',
      effort: null,
      permission: DEFAULT_AI_HARNESS_PERMISSION,
    });

    expect(selections.catalogue(ownerId, 'owner').default).toMatchObject({ model: 'other/model' });
    expect(selections.catalogue(memberId, 'member').default).toMatchObject({
      model: AI_DEFAULT_MODEL,
      model_route_id: meteredRouteId(memberId),
    });
  });
});
