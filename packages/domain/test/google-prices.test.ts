import { describe, expect, it } from 'vitest';
import { NO_PRICES } from '../src/ai-models';
import {
  GOOGLE_MODELS,
  UnknownGoogleModelError,
  googleModelIdOf,
  googleModelOf,
  googlePriceOf,
} from '../src/ai-prices-google';

describe('google models', () => {
  const [first] = GOOGLE_MODELS;

  it('finds a model by its id', () => {
    expect(googleModelOf('google:gemini-3.8-live').name).toBe('Gemini 3.8 Live');
  });

  it('names the model it has no price for', () => {
    expect(() => googleModelOf('google:nothing')).toThrow(UnknownGoogleModelError);
    expect(() => googleModelOf('google:nothing')).toThrow(
      'There is no Google price for google:nothing.',
    );
  });

  it('uses the listed price unless the home overrides it', () => {
    if (first === undefined) {
      throw new Error('expected at least one Google model');
    }
    expect(googlePriceOf(first.id, {})).toBe(first.pricing);
    const override = { ...NO_PRICES, input_per_mtok: 99 };
    expect(googlePriceOf(first.id, { [first.id]: override })).toBe(override);
    expect(googlePriceOf(first.id, { 'google:other': override })).toBe(first.pricing);
  });

  it('refuses to price an unknown model even with overrides', () => {
    expect(() => googlePriceOf('google:nothing', { 'google:nothing': NO_PRICES })).toThrow(
      UnknownGoogleModelError,
    );
  });

  it('turns an API model name into an id, dropping the models/ prefix', () => {
    expect(googleModelIdOf('models/gemini-2.5-flash')).toBe('google:gemini-2.5-flash');
    expect(googleModelIdOf('gemini-2.5-flash')).toBe('google:gemini-2.5-flash');
  });

  it('has unique ids', () => {
    expect(new Set(GOOGLE_MODELS.map((model) => model.id)).size).toBe(GOOGLE_MODELS.length);
  });
});
