import { NO_PRICES, type AiModelRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PhotoModelCatalogue } from '../../../src/photos/ai/catalogue';

const MOMENT = '2026-10-01T00:00:00.000Z';

function model(id: string, extra: Partial<AiModelRow>): AiModelRow {
  return {
    id,
    provider: 'openrouter',
    name: id,
    author: 'google',
    author_name: 'Google',
    family: 'gemini',
    description: '',
    created: MOMENT,
    context_length: 1000,
    max_output: 100,
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: [],
    reasoning: 'none',
    efforts: [],
    default_effort: null,
    tools: false,
    alias_of: null,
    pricing: { ...NO_PRICES, input_per_mtok: 0.5 },
    kinds: ['chat'],
    expires_at: null,
    synced_at: MOMENT,
    gone_at: null,
    ...extra,
  };
}

const ROWS: readonly AiModelRow[] = [
  model('google/see', { input_modalities: ['text', 'image'] }),
  model('google/blind', {}),
  model('google/seeing-but-kept', { input_modalities: ['text', 'image'] }),
  model('google/gone', { input_modalities: ['text', 'image'], gone_at: MOMENT }),
  model('google/paint', {
    input_modalities: ['text', 'image'],
    output_modalities: ['image'],
    kinds: ['image'],
  }),
  model('qwen/embed-text', {
    output_modalities: ['embeddings'],
    kinds: ['embed'],
  }),
  model('google/embed-image', {
    input_modalities: ['text', 'image'],
    output_modalities: ['embeddings'],
    kinds: ['embed'],
  }),
];

const KEEPING = new Set([
  'google/see',
  'google/blind',
  'google/gone',
  'google/paint',
  'qwen/embed-text',
  'google/embed-image',
]);

function catalogue(): PhotoModelCatalogue {
  return new PhotoModelCatalogue({ aiModels: { all: (): AiModelRow[] => [...ROWS] } }, () =>
    Promise.resolve(KEEPING),
  );
}

describe('the Photos model catalogue', () => {
  it('lists per feature the models that take the needed input and keep no data', async () => {
    const found = await catalogue().read();
    expect(found.vision.map((choice) => choice.id)).toEqual(['google/see']);
    expect(found.eraser.map((choice) => choice.id)).toEqual(['google/paint']);
    expect(found.embedding.map((choice) => choice.id)).toEqual([
      'google/embed-image',
      'qwen/embed-text',
    ]);
    expect(found.petEmbedding.map((choice) => choice.id)).toEqual(['google/embed-image']);
    expect(found.vision[0]).toEqual({
      id: 'google/see',
      name: 'google/see',
      author: 'Google',
      contextLength: 1000,
      inputPerMtok: 0.5,
    });
  });

  it('accepts a listed model and refuses one that is not listed for that feature', async () => {
    await expect(
      catalogue().require({ vision: 'google/see', eraser: 'google/paint' }),
    ).resolves.toBeUndefined();
    await expect(catalogue().require({ vision: 'google/blind' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(catalogue().require({ vision: 'google/seeing-but-kept' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(catalogue().require({ petEmbedding: 'qwen/embed-text' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(catalogue().require({})).resolves.toBeUndefined();
  });

  it('fails when the retention list cannot be read instead of listing every model', async () => {
    const broken = new PhotoModelCatalogue(
      { aiModels: { all: (): AiModelRow[] => [...ROWS] } },
      () => Promise.reject(new Error('offline')),
    );
    await expect(broken.read()).rejects.toThrow('offline');
  });
});
