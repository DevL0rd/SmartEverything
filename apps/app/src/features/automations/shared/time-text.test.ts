import { describe, expect, it } from 'vitest';
import { sentenceStart } from './time-text';

describe('sentenceStart', () => {
  it('capitalises the first letter only', () => {
    expect(sentenceStart('at sunset')).toBe('At sunset');
    expect(sentenceStart('')).toBe('');
  });
});
