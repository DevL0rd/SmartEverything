import { effectiveImageOptions, IMAGE_ENDPOINT } from '@smarteverything/domain';
import type { ImageDefaults } from '@smarteverything/domain';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  imageOptionFields,
  optionSupported,
  optionValues,
  useImageDefaults,
  withImageDefault,
  type ImageOptionField,
} from './use-image-defaults';

interface StatusSource {
  readonly settings: { readonly image_defaults: ImageDefaults };
}

const state: { status: StatusSource | null } = vi.hoisted((): { status: StatusSource | null } => ({
  status: null,
}));

vi.mock('../../data/assistant-data', () => ({
  useAssistantStatus: (): StatusSource | null => state.status,
}));

const MODEL = IMAGE_ENDPOINT.parse({
  model: 'google/gemini-nano-banana-2.1',
  name: 'Nano Banana 2.1',
  provider_tag: 'google',
  parameters: {
    aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16'] },
    resolution: { type: 'enum', values: ['512', '1K', '2K', '4K'] },
    quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
    background: { type: 'enum', values: ['auto', 'transparent', 'opaque'] },
    output_format: { type: 'enum', values: ['png', 'jpeg', 'webp', 'svg'] },
  },
  supports_streaming: false,
  pricing: [],
});

const PLAIN = IMAGE_ENDPOINT.parse({
  model: 'vendor/plain',
  name: 'Plain',
  provider_tag: 'vendor',
  parameters: { quality: { type: 'enum', values: ['auto', 'high'] } },
  supports_streaming: false,
  pricing: [],
});

const KEY = `${MODEL.model}|${MODEL.provider_tag}`;
const CHOICE = { model: MODEL.model, provider_tag: MODEL.provider_tag };

interface FieldLookup {
  readonly fields: readonly ImageOptionField[];
  readonly find: (key: string) => ImageOptionField | undefined;
}

function fieldOf(
  endpoint: Parameters<typeof imageOptionFields>[0],
  defaults: ImageDefaults,
): FieldLookup {
  const fields = imageOptionFields(endpoint, defaults);
  const find = (key: string): ImageOptionField | undefined =>
    fields.find((field) => field.key === key);
  return { fields, find };
}

describe('image option fields', () => {
  it('lists every user-facing field in a fixed order', () => {
    expect(imageOptionFields(MODEL, {}).map((field) => field.key)).toStrictEqual([
      'aspect_ratio',
      'resolution',
      'quality',
      'background',
      'output_format',
    ]);
  });

  it('supports a field only when the endpoint has an enum descriptor for it', () => {
    const { find } = fieldOf(MODEL, {});
    expect(find('aspect_ratio')?.supported).toBe(true);
    expect(find('quality')?.supported).toBe(true);
    expect(find('background')?.supported).toBe(true);
    expect(find('output_format')?.supported).toBe(true);

    const plain = fieldOf(PLAIN, {});
    expect(plain.find('quality')?.supported).toBe(true);
    expect(plain.find('aspect_ratio')?.supported).toBe(false);
    expect(plain.find('resolution')?.supported).toBe(false);
    expect(plain.find('background')?.supported).toBe(false);
    expect(plain.find('output_format')?.supported).toBe(false);
  });

  it('offers the descriptor values and the platform default as the current value', () => {
    const { find } = fieldOf(MODEL, {});
    expect(find('aspect_ratio')?.values).toStrictEqual(['1:1', '16:9', '9:16']);
    expect(find('quality')?.value).toBe('high');
    expect(find('resolution')?.value).toBe('1K');
    expect(find('aspect_ratio')?.value).toBeNull();
    expect(find('background')?.value).toBeNull();
  });

  it('shows a saved value as the current value instead of the platform default', () => {
    const saved: ImageDefaults = {
      [KEY]: { aspect_ratio: '16:9', quality: 'medium', background: 'transparent' },
    };
    const { find } = fieldOf(MODEL, saved);
    expect(find('aspect_ratio')?.value).toBe('16:9');
    expect(find('quality')?.value).toBe('medium');
    expect(find('background')?.value).toBe('transparent');
    expect(find('resolution')?.value).toBe('1K');
  });

  it('marks every field unsupported when no endpoint is selected', () => {
    const fields = imageOptionFields(null, { [KEY]: { quality: 'high' } });
    expect(fields.every((field) => !field.supported)).toBe(true);
    expect(fields.every((field) => field.value === null)).toBe(true);
    expect(fields.every((field) => field.values.length === 0)).toBe(true);
  });

  it('keeps only raster formats and needs two of them for output format', () => {
    const wide = fieldOf(MODEL, {});
    expect(wide.find('output_format')?.values).toStrictEqual(['png', 'jpeg', 'webp']);

    const oneRaster = IMAGE_ENDPOINT.parse({
      model: 'vendor/svg',
      name: 'SVG',
      provider_tag: 'vendor',
      parameters: { output_format: { type: 'enum', values: ['png', 'svg'] } },
      supports_streaming: false,
      pricing: [],
    });
    expect(fieldOf(oneRaster, {}).find('output_format')?.supported).toBe(false);
    expect(fieldOf(oneRaster, {}).find('output_format')?.value).toBeNull();

    const noFormat = IMAGE_ENDPOINT.parse({
      model: 'vendor/plain',
      name: 'Plain',
      provider_tag: 'vendor',
      parameters: {},
      supports_streaming: false,
      pricing: [],
    });
    expect(fieldOf(noFormat, {}).find('output_format')?.supported).toBe(false);
  });
});

describe('option support and values', () => {
  it('reports support only for enum descriptors', () => {
    expect(optionSupported(MODEL, 'aspect_ratio')).toBe(true);
    expect(optionSupported(MODEL, 'quality')).toBe(true);
    expect(optionSupported(PLAIN, 'aspect_ratio')).toBe(false);
    expect(optionSupported(PLAIN, 'quality')).toBe(true);
  });

  it('lists enum values as strings and keeps only raster output formats', () => {
    expect(optionValues(MODEL, 'resolution')).toStrictEqual(['512', '1K', '2K', '4K']);
    expect(optionValues(MODEL, 'output_format')).toStrictEqual(['png', 'jpeg', 'webp']);
    expect(optionValues(PLAIN, 'aspect_ratio')).toStrictEqual([]);
  });

  it('treats output_format as unsupported with fewer than two raster formats', () => {
    const oneRaster = IMAGE_ENDPOINT.parse({
      model: 'vendor/svg',
      name: 'SVG',
      provider_tag: 'vendor',
      parameters: { output_format: { type: 'enum', values: ['png', 'svg'] } },
      supports_streaming: false,
      pricing: [],
    });
    expect(optionSupported(oneRaster, 'output_format')).toBe(false);
    expect(optionSupported(PLAIN, 'output_format')).toBe(false);
  });
});

describe('the effective options the fields read', () => {
  it('merges platform defaults with saved values', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium' } };
    expect(effectiveImageOptions(MODEL, saved)).toStrictEqual({
      quality: 'medium',
      resolution: '1K',
    });
  });

  it('lets explicit options override saved and platform values', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium' } };
    expect(effectiveImageOptions(MODEL, saved, { quality: 'low' })).toStrictEqual({
      quality: 'low',
      resolution: '1K',
    });
  });
});

describe('the saved image defaults hook', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    state.status = null;
  });

  it('reads image_defaults from assistant settings', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium' } };
    state.status = { settings: { image_defaults: saved } };
    let seen: ImageDefaults | null = null;
    const Probe = (): null => {
      seen = useImageDefaults();
      return null;
    };
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(Probe));
    });
    expect(seen).toStrictEqual(saved);
    act(() => {
      root.unmount();
    });
  });

  it('falls back to an empty map without assistant settings', () => {
    let seen: ImageDefaults | null = null;
    const Probe = (): null => {
      seen = useImageDefaults();
      return null;
    };
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(Probe));
    });
    expect(seen).toStrictEqual({});
    act(() => {
      root.unmount();
    });
  });
});

describe('saving an image default', () => {
  it('writes a value under the model key without touching other models', () => {
    const saved: ImageDefaults = { 'vendor/plain|vendor': { quality: 'high' } };
    const next = withImageDefault(saved, CHOICE, 'quality', 'medium');
    expect(next[KEY]).toStrictEqual({ quality: 'medium' });
    expect(next['vendor/plain|vendor']).toStrictEqual({ quality: 'high' });
    expect(saved[KEY]).toBeUndefined();
  });

  it('keeps the other keys of the same model when changing one', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium', resolution: '2K' } };
    const next = withImageDefault(saved, CHOICE, 'resolution', '4K');
    expect(next[KEY]).toStrictEqual({ quality: 'medium', resolution: '4K' });
  });

  it('deletes a key on null so the platform default applies again', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium', resolution: '2K' } };
    expect(withImageDefault(saved, CHOICE, 'quality', null)[KEY]).toStrictEqual({
      resolution: '2K',
    });
  });

  it('removes the model entry when its last key is deleted', () => {
    const saved: ImageDefaults = { [KEY]: { quality: 'medium' } };
    expect(withImageDefault(saved, CHOICE, 'quality', null)).toStrictEqual({});
  });
});
