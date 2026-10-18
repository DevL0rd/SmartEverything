import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_ID,
  AUTO_LATEST_GEMINI_FLASH,
  closestEffort,
  displayNameOf,
  latestGeminiFlash,
  latestGeminiFlashLite,
  latestVersioned,
  NO_PRICES,
  type AiEffort,
  type AiModelKind,
  type AiModelRow,
} from '../src/ai-models';

function model(
  id: string,
  extra: Partial<Pick<AiModelRow, 'created' | 'gone_at' | 'kinds' | 'name'>> = {},
): AiModelRow {
  return {
    id,
    provider: 'openrouter',
    name: extra.name ?? id,
    author: 'google',
    author_name: 'Google',
    family: 'gemini',
    description: '',
    created: extra.created ?? '2026-01-01T00:00:00.000Z',
    context_length: null,
    max_output: null,
    input_modalities: [],
    output_modalities: [],
    supported_parameters: [],
    reasoning: 'none',
    efforts: [],
    default_effort: null,
    tools: true,
    alias_of: null,
    pricing: NO_PRICES,
    kinds: extra.kinds ?? ['chat'],
    expires_at: null,
    synced_at: '2026-01-01T00:00:00.000Z',
    gone_at: extra.gone_at ?? null,
  };
}

function idsOf(found: AiModelRow | null): string | null {
  return found === null ? null : found.id;
}

describe('model ids', () => {
  it('accepts a vendor path and a google shorthand and refuses anything else', () => {
    expect(AI_MODEL_ID.safeParse('google/gemini-3.8-flash').success).toBe(true);
    expect(AI_MODEL_ID.safeParse('google:gemini-live').success).toBe(true);
    expect(AI_MODEL_ID.safeParse('gemini').success).toBe(false);
    expect(AI_MODEL_ID.safeParse('a/').success).toBe(false);
  });
});

describe('latest Gemini Flash', () => {
  it('prefers the higher version, counting the minor number', () => {
    const models = [
      model('google/gemini-2.5-flash'),
      model('google/gemini-3-flash'),
      model('google/gemini-3.8-flash'),
      model('google/gemini-3.10-flash'),
    ];
    expect(idsOf(latestGeminiFlash(models))).toBe('google/gemini-3.10-flash');
  });

  it('prefers a stable build over a preview of the same version', () => {
    const models = [
      model('google/gemini-3.8-flash-preview-0901'),
      model('google/gemini-3.8-flash'),
      model('google/gemini-3.8-flash-preview'),
    ];
    expect(idsOf(latestGeminiFlash(models))).toBe('google/gemini-3.8-flash');
  });

  it('prefers the newer of two previews with the same version', () => {
    const models = [
      model('google/gemini-3.8-flash-preview-a', { created: '2026-02-01T00:00:00.000Z' }),
      model('google/gemini-3.8-flash-preview-b', { created: '2026-03-01T00:00:00.000Z' }),
      model('google/gemini-3.8-flash-preview-c', { created: '2026-01-15T00:00:00.000Z' }),
    ];
    expect(idsOf(latestGeminiFlash(models))).toBe('google/gemini-3.8-flash-preview-b');
  });

  it('skips models that are gone or cannot chat, and other families', () => {
    const models = [
      model('google/gemini-9-flash', { gone_at: '2026-04-01T00:00:00.000Z' }),
      model('google/gemini-8-flash', { kinds: ['image'] }),
      model('google/gemini-7-pro'),
      model('openai/gpt-flash'),
      model('google/gemini-3-flash'),
    ];
    expect(idsOf(latestGeminiFlash(models))).toBe('google/gemini-3-flash');
  });

  it('finds nothing in an empty catalogue', () => {
    expect(latestGeminiFlash([])).toBeNull();
  });

  it('keeps flash and flash lite apart', () => {
    const models = [model('google/gemini-3-flash-lite'), model('google/gemini-2-flash')];
    expect(idsOf(latestGeminiFlash(models))).toBe('google/gemini-2-flash');
    expect(idsOf(latestGeminiFlashLite(models))).toBe('google/gemini-3-flash-lite');
  });

  it('can look for another kind of model with its own pattern', () => {
    const kinds: AiModelKind[] = ['image'];
    const models = [model('google/gemini-3-flash', { kinds }), model('google/gemini-4-flash')];
    expect(
      idsOf(latestVersioned(models, /^google\/gemini-(\d+)(?:\.(\d+))?-flash$/, 'image')),
    ).toBe('google/gemini-3-flash');
  });
});

describe('closest effort', () => {
  const closest = (efforts: AiEffort[], wanted: AiEffort): AiEffort | null =>
    closestEffort({ efforts }, wanted);

  it('is nothing when the model offers no effort levels', () => {
    expect(closest([], 'high')).toBeNull();
  });

  it('is the wanted level when the model offers it', () => {
    expect(closest(['low', 'medium', 'high'], 'medium')).toBe('medium');
  });

  it('is the nearest level otherwise, the earlier one on a tie', () => {
    expect(closest(['low', 'high'], 'xhigh')).toBe('high');
    expect(closest(['minimal', 'high'], 'none')).toBe('minimal');
    expect(closest(['low', 'high'], 'medium')).toBe('low');
    expect(closest(['high', 'low'], 'medium')).toBe('high');
  });
});

describe('display name', () => {
  it('marks a model that was picked as the latest one', () => {
    const flash = model('google/gemini-3-flash', { name: 'Gemini 3 Flash' });
    expect(displayNameOf(flash, AUTO_LATEST_GEMINI_FLASH)).toBe('Gemini 3 Flash (latest)');
    expect(displayNameOf(flash, 'google/gemini-3-flash')).toBe('Gemini 3 Flash');
  });
});
