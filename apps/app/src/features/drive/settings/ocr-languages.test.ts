import { describe, expect, it } from 'vitest';
import { ocrChoicesOf, ocrLanguagesAfter, ocrLineOf, ocrValueOf } from './ocr-languages';

describe('picture text languages', () => {
  it('marks the chosen languages and keeps a chosen code the list does not name', () => {
    const choices = ocrChoicesOf(['eng', 'gle']);
    expect(choices.find((choice) => choice.code === 'eng')).toEqual({
      code: 'eng',
      name: 'English',
      chosen: true,
    });
    expect(choices.find((choice) => choice.code === 'deu')?.chosen).toBe(false);
    expect(choices.at(-1)).toEqual({ code: 'gle', name: 'gle', chosen: true });
  });

  it('adds and removes a language but never leaves none', () => {
    expect(ocrLanguagesAfter(['eng'], 'deu', true)).toEqual(['eng', 'deu']);
    expect(ocrLanguagesAfter(['eng', 'deu'], 'deu', true)).toEqual(['eng', 'deu']);
    expect(ocrLanguagesAfter(['eng', 'deu'], 'eng', false)).toEqual(['deu']);
    expect(ocrLanguagesAfter(['eng'], 'eng', false)).toBeNull();
  });

  it('sums up the chosen languages for the row value', () => {
    expect(ocrValueOf(['eng'])).toBe('English');
    expect(ocrValueOf(['eng', 'deu'])).toBe('English and German');
    expect(ocrValueOf(['eng', 'deu', 'fra', 'gle'])).toBe('English, German and 2 more');
  });

  it('names the languages in the caption', () => {
    expect(ocrLineOf(['eng', 'chi_sim'])).toBe(
      'Reads text in pictures in English, Chinese, simplified. A new language downloads once to the Hub.',
    );
  });
});
