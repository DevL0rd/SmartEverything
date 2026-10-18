import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  TIMELINE_BUDGET_CHARS,
  TIMELINE_FIELD_CHARS,
  boundedTimeline,
  compactTimeline,
  COMPACT_TEXT_CHARS,
  COMPACT_LINK_CHARS,
  toolResultPage,
  type ChatTimelineEmbed,
  type ChatTimelineTool,
} from '../src';

function tool(callId: string, input: string | null, output: string | null): ChatTimelineTool {
  return {
    callId,
    name: 'bash',
    title: 'bash',
    state: 'done',
    detail: null,
    input,
    output,
    redacted: false,
    image_operation_id: null,
  };
}

function embedOf(...tools: ChatTimelineTool[]): ChatTimelineEmbed {
  return {
    kind: 'chat_timeline',
    version: 1,
    parts: [
      { kind: 'text', key: 'text:0', text: 'before' },
      ...tools.map((entry) => ({ kind: 'tool' as const, key: entry.callId, tool: entry })),
    ],
  };
}

function toolAt(embed: ChatTimelineEmbed, index: number): ChatTimelineTool {
  const part = embed.parts[index];
  if (part?.kind !== 'tool') throw new Error('expected a tool part');
  return part.tool;
}

describe('boundedTimeline', () => {
  it('returns the same timeline when every field fits', () => {
    const embed = embedOf(tool('a', 'in', 'out'));

    expect(boundedTimeline(embed)).toBe(embed);
  });

  it('clips a long field and says how long the whole text is', () => {
    const embed = embedOf(tool('a', 'in', 'x'.repeat(TIMELINE_FIELD_CHARS + 500)));

    const shown = toolAt(boundedTimeline(embed), 1);

    expect(shown.output).toHaveLength(TIMELINE_FIELD_CHARS);
    expect(shown.output_chars).toBe(TIMELINE_FIELD_CHARS + 500);
    expect(shown.input).toBe('in');
    expect(shown.input_chars).toBeUndefined();
  });

  it('reports the length of a clipped input as well', () => {
    const embed = embedOf(tool('a', 'y'.repeat(100), 'out'));

    const shown = toolAt(boundedTimeline(embed, 10), 1);

    expect(shown.input).toHaveLength(10);
    expect(shown.input_chars).toBe(100);
    expect(shown.output_chars).toBeUndefined();
  });

  it('shares the whole budget between the fields of many tool calls', () => {
    const many = Array.from({ length: 16 }, (_, index) =>
      tool(`call-${String(index)}`, null, 'z'.repeat(TIMELINE_BUDGET_CHARS)),
    );

    const shown = toolAt(boundedTimeline(embedOf(...many)), 1);

    expect(shown.output).toHaveLength(TIMELINE_BUDGET_CHARS / 16);
  });

  it('leaves a field whole that is shorter than its share and clips the others', () => {
    const embed = embedOf(tool('a', null, 'short'), tool('b', null, 'q'.repeat(50)));

    const bounded = boundedTimeline(embed, 20);

    expect(toolAt(bounded, 1)).toBe(toolAt(embed, 1));
    expect(toolAt(bounded, 2).output_chars).toBe(50);
  });

  it('never cuts an emoji in half', () => {
    const embed = embedOf(tool('a', null, `ab${'😀'.repeat(10)}`));

    const shown = toolAt(boundedTimeline(embed, 3), 1).output ?? '';

    expect(shown).toBe('ab');
  });

  it('keeps one character of progress when the limit is smaller than an emoji', () => {
    const embed = embedOf(tool('a', null, '😀😀'));

    const shown = toolAt(boundedTimeline(embed, 1), 1).output ?? '';

    expect(shown).toBe('😀');
  });
});

describe('toolResultPage', () => {
  const entry = tool('call-1', 'echo hi', '0123456789abcdef');

  it('returns a page and where the next one starts', () => {
    expect(toolResultPage(entry, 'output', 4, 6)).toStrictEqual({
      call_id: 'call-1',
      name: 'bash',
      field: 'output',
      offset: 4,
      total_chars: 16,
      text: '456789',
      next_offset: 10,
    });
  });

  it('has no next page at the end of the text', () => {
    expect(toolResultPage(entry, 'output', 10, 100)).toMatchObject({
      text: 'abcdef',
      next_offset: null,
    });
  });

  it('is empty past the end', () => {
    expect(toolResultPage(entry, 'output', 500, 10)).toMatchObject({
      offset: 16,
      text: '',
      next_offset: null,
    });
  });

  it('reads the input, and an absent field as empty', () => {
    expect(toolResultPage(entry, 'input', 0, 100).text).toBe('echo hi');
    expect(toolResultPage(tool('c', null, null), 'output', 0, 10)).toMatchObject({
      total_chars: 0,
      text: '',
      next_offset: null,
    });
  });
});

const COMPACTED = z.object({ status: z.string(), rows: z.array(z.unknown()), text: z.string() });
const LINKED = z.object({ body: z.string() });

describe('compactTimeline', () => {
  const long = 'x'.repeat(5_000);

  it('keeps the structure of a long JSON field and clips only its long text', () => {
    const output = JSON.stringify({ status: 'ok', rows: [{ id: 1 }, { id: 2 }], text: long });
    const embed = embedOf(tool('a', '{"command":"ls"}', output));

    const shown = toolAt(compactTimeline(embed), 1);
    const parsed = COMPACTED.parse(JSON.parse(shown.output ?? ''));

    expect(parsed.status).toBe('ok');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.text).toHaveLength(COMPACT_TEXT_CHARS);
    expect(shown.output_chars).toBe(output.length);
    expect(shown.input).toBe('{"command":"ls"}');
    expect(shown.input_chars).toBeUndefined();
  });

  it('keeps a long text that holds a link longer than other text', () => {
    const link = `see https://example.com/page ${long}`;
    const embed = embedOf(tool('a', null, JSON.stringify({ body: link })));

    const parsed = LINKED.parse(JSON.parse(toolAt(compactTimeline(embed), 1).output ?? ''));

    expect(parsed.body).toHaveLength(COMPACT_LINK_CHARS);
    expect(parsed.body).toContain('https://example.com/page');
  });

  it('leaves short fields, plain text, running tools and file evidence as they are', () => {
    const files = JSON.stringify({ meta: { diffs: [{ newText: long }] } });
    const embed = embedOf(
      tool('a', 'in', JSON.stringify({ ok: true })),
      tool('b', null, long),
      { ...tool('c', null, JSON.stringify({ text: long })), state: 'running' },
      tool('d', null, files),
    );

    expect(compactTimeline(embed)).toBe(embed);
  });

  it('is idempotent', () => {
    const once = compactTimeline(embedOf(tool('a', null, JSON.stringify({ text: long }))));

    expect(compactTimeline(once)).toBe(once);
  });
});
