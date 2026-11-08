import { describe, expect, it } from 'vitest';
import { WEB_SOURCE } from '@smarteverything/domain';
import { mergedSources } from '../../src/assistant/web-search';

const SOURCES = [
  { url: 'https://example.com/a', title: 'Weather A' },
  { url: 'https://example.com/a', title: 'Weather A' },
  { url: 'javascript:alert(1)', title: 'Bad' },
];

describe('web search sources', () => {
  it('keeps the valid sources once each', () => {
    const valid = SOURCES.flatMap((source) => {
      const parsed = WEB_SOURCE.safeParse(source);
      return parsed.success ? [parsed.data] : [];
    });
    expect(valid).toHaveLength(2);
    expect(mergedSources([], valid)).toEqual([
      { url: 'https://example.com/a', title: 'Weather A' },
    ]);
  });
});
