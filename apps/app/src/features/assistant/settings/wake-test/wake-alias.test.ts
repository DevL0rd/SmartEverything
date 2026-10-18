import { describe, expect, it } from 'vitest';
import { aliasFromHeard, aliasWordsOf } from './wake-alias';

describe('alias from a heard phrase', () => {
  it('keeps what follows the greeting up to the first pause', () => {
    expect(aliasFromHeard('Hey Jarvis, what time is it?', 'Coordinator', [])).toBe('Jarvis');
  });

  it('strips a stack of leading greetings and ignores their case', () => {
    expect(aliasFromHeard('OK, hey Mister Bean.', 'Coordinator', [])).toBe('Mister Bean');
  });

  it('trims spaces and edge punctuation', () => {
    expect(aliasFromHeard('  hey   Jarvis!!  ', 'Coordinator', [])).toBe('Jarvis');
  });

  it('keeps at most two words after a greeting in an unpunctuated sentence', () => {
    expect(aliasFromHeard('hey jarvis what time is it', 'Coordinator', [])).toBe('jarvis what');
  });

  it('does not guess when the name could be anywhere in a sentence', () => {
    expect(aliasFromHeard('yo whats up momo, how is your day', 'Coordinator', [])).toBeNull();
  });

  it('guesses a short phrase without a greeting', () => {
    expect(aliasFromHeard('Mister Bean, what time is it', 'Coordinator', [])).toBe('Mister Bean');
  });

  it('takes a phrase without any greeting as it is', () => {
    expect(aliasFromHeard('Jarvis', 'Coordinator', [])).toBe('Jarvis');
  });

  it('refuses the assistant name in any case', () => {
    expect(aliasFromHeard('hey COORDINATOR', 'Coordinator', [])).toBeNull();
  });

  it('refuses an alias that is already saved', () => {
    expect(aliasFromHeard('hey jarvis', 'Coordinator', ['Jarvis'])).toBeNull();
  });

  it('refuses a greeting with nothing after it', () => {
    expect(aliasFromHeard('Hey!', 'Coordinator', [])).toBeNull();
  });

  it('refuses a phrase longer than a name may be', () => {
    expect(aliasFromHeard(`hey ${'x'.repeat(41)}`, 'Coordinator', [])).toBeNull();
  });
});

describe('words to pick an alias from', () => {
  it('offers every word of a sentence with the name anywhere in it', () => {
    expect(aliasWordsOf('yo whats up momo, how is your day', 'Coordinator', [])).toEqual([
      'yo',
      'whats',
      'up',
      'momo',
      'how',
      'is',
      'your',
      'day',
    ]);
  });

  it('leaves out greetings, the name, saved aliases and repeats in any case', () => {
    expect(aliasWordsOf('Hey, Jarvis jarvis OK coordinator Momo', 'Coordinator', ['momo'])).toEqual(
      ['Jarvis'],
    );
  });

  it('leaves out words longer than a name may be', () => {
    expect(aliasWordsOf(`hello ${'x'.repeat(41)} Momo`, 'Coordinator', [])).toEqual(['Momo']);
  });

  it('offers nothing for an empty phrase', () => {
    expect(aliasWordsOf('  ', 'Coordinator', [])).toEqual([]);
  });
});
