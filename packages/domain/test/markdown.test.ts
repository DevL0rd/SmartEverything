import { describe, expect, it } from 'vitest';
import { messageQuoteOf } from '../src';
import { plainTextOf } from '../src/markdown';

describe('plainTextOf', () => {
  it('drops emphasis, code marks, link targets and list markers', () => {
    const text =
      'Three that fit:\n\n1. **Hue Filament Globe**: 2200 K\n2. *Tradfri* globe, see [the manual](https://example.com/m)\n\nRun `scene.apply`.';
    expect(plainTextOf(text)).toBe(
      'Three that fit: Hue Filament Globe: 2200 K · Tradfri globe, see the manual Run scene.apply.',
    );
  });

  it('keeps headings, quotes and code as their words on one line', () => {
    expect(plainTextOf('## Plan\n\n> keep it dim\n\n```sh\nls  -la\n```')).toBe(
      'Plan keep it dim ls -la',
    );
  });

  it('returns an empty excerpt for empty text', () => {
    expect(plainTextOf('  \n ')).toBe('');
  });
});

describe('messageQuoteOf', () => {
  it('stores the quoted markdown reply as plain text', () => {
    const quote = messageQuoteOf({
      id: 'm1',
      author: 'Assistant',
      text: 'Three that fit:\n1. **Hue Filament Globe**: 2200 K, about',
      attachments: [],
    });
    expect(quote.excerpt).toBe('Three that fit: Hue Filament Globe: 2200 K, about');
  });

  it('falls back to the voice transcript when the message has no text', () => {
    const quote = messageQuoteOf({
      id: 'm2',
      author: 'Ana',
      text: '',
      attachments: [{ mime: 'audio/ogg', transcript: 'Is the  greenhouse ready?' }],
    });
    expect([quote.excerpt, quote.media_kind]).toEqual(['Is the greenhouse ready?', 'voice']);
  });
});
