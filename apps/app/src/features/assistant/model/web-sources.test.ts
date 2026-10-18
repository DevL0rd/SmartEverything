import { describe, expect, it } from 'vitest';
import type { ChatTimelinePart } from '@smarteverything/domain';
import { inlineTimeline } from './inline-timeline';
import { timelineSources, type NumberedSource } from './web-sources';

const FOUND = 'https://example.com/a';

const part: ChatTimelinePart = {
  kind: 'tool',
  key: 'tool-1',
  tool: {
    callId: '1',
    name: 'web_fetch',
    title: 'Fetch',
    state: 'done',
    detail: null,
    input: null,
    output: `see ${FOUND} now`,
    redacted: false,
    image_operation_id: null,
  },
};

const parts = inlineTimeline([part]);

const sources: readonly NumberedSource[] = [
  { number: 1, source: { url: FOUND, title: 'A' } },
  { number: 2, source: { url: 'https://example.com/missing', title: 'B' } },
];

describe('timelineSources', () => {
  it('assigns a source to the tool group that mentions it and keeps the rest', () => {
    const result = timelineSources(parts, sources);
    expect(result.groups.get(parts[0]?.key ?? '')).toEqual([sources[0]]);
    expect(result.remaining).toEqual([sources[1]]);
  });

  it('returns the same result for the same parts and sources', () => {
    expect(timelineSources(parts, sources)).toBe(timelineSources(parts, sources));
  });

  it('does not share results between different source lists', () => {
    expect(timelineSources(parts, sources)).not.toBe(timelineSources(parts, [...sources]));
  });
});
