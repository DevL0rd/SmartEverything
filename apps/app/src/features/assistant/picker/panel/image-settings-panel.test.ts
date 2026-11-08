import { describe, expect, it } from 'vitest';
import type { ImageOptionField } from '../image/use-image-defaults';

const { imageSettingsSummary, optionsFor } = await import('./image-settings-panel');

function field(over: Partial<ImageOptionField>): ImageOptionField {
  return {
    key: 'quality',
    label: 'Quality',
    supported: true,
    values: ['low', 'high'],
    value: 'high',
    ...over,
  };
}

describe('optionsFor', () => {
  it('lists only the real values the endpoint offers', () => {
    expect(optionsFor(field({}))).toEqual([
      { value: 'low', label: 'low' },
      { value: 'high', label: 'high' },
    ]);
  });

  it('keeps the value that applies listed when the endpoint list lacks it', () => {
    expect(optionsFor(field({ values: ['low'], value: 'high' }))).toEqual([
      { value: 'high', label: 'high' },
      { value: 'low', label: 'low' },
    ]);
  });
});

describe('imageSettingsSummary', () => {
  it('joins aspect ratio, resolution and quality with their current values', () => {
    const fields = [
      field({ key: 'aspect_ratio', value: '16:9' }),
      field({ key: 'resolution', value: '1K' }),
      field({ key: 'quality', value: 'high' }),
    ];
    expect(imageSettingsSummary(fields)).toBe('16:9 · 1K · high');
  });

  it('leaves out a supported field with no value', () => {
    const fields = [
      field({ key: 'aspect_ratio', value: null }),
      field({ key: 'resolution', value: '2K' }),
      field({ key: 'quality', value: 'high' }),
    ];
    expect(imageSettingsSummary(fields)).toBe('2K · high');
  });

  it('skips unsupported fields and non-core keys', () => {
    const fields = [
      field({ key: 'aspect_ratio', supported: false, values: [], value: null }),
      field({ key: 'resolution', value: '1K' }),
      field({ key: 'quality', value: 'high' }),
      field({ key: 'background', value: 'transparent' }),
      field({ key: 'output_format', value: 'png' }),
    ];
    expect(imageSettingsSummary(fields)).toBe('1K · high');
  });

  it('has no summary when no core field is supported', () => {
    const fields = [
      field({ key: 'aspect_ratio', supported: false, values: [], value: null }),
      field({ key: 'resolution', supported: false, values: [], value: null }),
      field({ key: 'quality', supported: false, values: [], value: null }),
      field({ key: 'background', value: 'opaque' }),
    ];
    expect(imageSettingsSummary(fields)).toBeNull();
  });
});
