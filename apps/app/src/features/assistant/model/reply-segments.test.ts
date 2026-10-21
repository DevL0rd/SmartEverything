import { describe, expect, it } from 'vitest';
import type { ChatTimelinePart } from '@smarteverything/domain';
import { TEXT_CHUNK_CHARS, inlineTimeline, type InlineTimelinePart } from './inline-timeline';
import { SEGMENT_BUDGET, partWeight, replySegments } from './reply-segments';

function tool(id: string, name: string, chars: number): ChatTimelinePart {
  return {
    kind: 'tool',
    key: `tool-${id}`,
    tool: {
      callId: id,
      name,
      title: name,
      state: 'done',
      detail: null,
      input: JSON.stringify({ command: 'x'.repeat(Math.floor(chars / 2)) }),
      output: 'y'.repeat(Math.floor(chars / 2)),
      redacted: false,
      image_operation_id: null,
    },
  };
}

function paragraphs(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `Paragraph ${String(index)} ${'word '.repeat(30)}`,
  ).join('\n\n');
}

function giantTurn(): readonly ChatTimelinePart[] {
  const parts: ChatTimelinePart[] = [];
  const tools = [
    ['bash', 2100],
    ['edit', 3100],
    ['read', 1800],
    ['write', 12100],
    ['job_output', 700],
    ['tool_call', 4000],
  ] as const;
  for (let turn = 0; turn < 98; turn += 1) {
    const text = turn === 40 ? paragraphs(34) : `Step ${String(turn)} ${'detail '.repeat(25)}`;
    parts.push({ kind: 'text', key: `text-${String(turn)}`, text });
    const burst = turn % 3 === 0 ? 1 : (turn % 4) + 1;
    for (let at = 0; at < burst; at += 1) {
      const [name, chars] = tools[(turn + at) % tools.length] ?? tools[0];
      parts.push(tool(`${String(turn)}-${String(at)}`, name, chars));
    }
  }
  return parts;
}

function weightOf(parts: readonly InlineTimelinePart[], from: number, to: number): number {
  return parts.slice(from, to).reduce((sum, part) => sum + partWeight(part), 0);
}

describe('long text units', () => {
  it('splits a 4.9 KB text part at paragraph boundaries and keeps all content', () => {
    const text = paragraphs(34);
    expect(text.length).toBeGreaterThan(4800);
    const units = inlineTimeline([{ kind: 'text', key: 't', text }]);
    expect(units.length).toBeGreaterThan(3);
    expect(units.map((unit) => (unit.kind === 'text' ? unit.text : '')).join('\n\n')).toBe(text);
    expect(units.map((unit) => unit.key)).toEqual(
      units.map((_, index) => (index === 0 ? 't' : `t#${String(index)}`)),
    );
    for (const unit of units) {
      expect(unit.kind === 'text' && unit.text.length).toBeLessThanOrEqual(TEXT_CHUNK_CHARS + 200);
    }
  });

  it('keeps a short or unbroken text part whole', () => {
    expect(inlineTimeline([{ kind: 'text', key: 't', text: 'short' }])).toHaveLength(1);
    const unbroken = 'word '.repeat(600);
    expect(inlineTimeline([{ kind: 'text', key: 't', text: unbroken }])).toHaveLength(1);
  });
});

describe('replySegments on a turn shaped like the measured 280-part agent turn', () => {
  const units = inlineTimeline(giantTurn());
  const segments = replySegments(units);

  it('covers every unit exactly once, in order', () => {
    expect(segments[0]?.from).toBe(0);
    expect(segments.at(-1)?.to).toBe(units.length);
    segments.forEach((segment, index) => {
      expect(segment.index).toBe(index);
      expect(segment.count).toBe(segments.length);
      expect(segment.to).toBeGreaterThan(segment.from);
      if (index > 0) expect(segment.from).toBe(segments[index - 1]?.to);
    });
  });

  it('keeps every segment within the mount budget unless it is one heavy unit', () => {
    expect(segments.length).toBeGreaterThan(40);
    for (const segment of segments) {
      const weight = weightOf(units, segment.from, segment.to);
      if (segment.to - segment.from > 1) expect(weight).toBeLessThanOrEqual(SEGMENT_BUDGET);
    }
  });

  it('is cached per parts array', () => {
    expect(replySegments(units)).toBe(segments);
  });
});

describe('replySegments on a small reply', () => {
  it('returns one segment', () => {
    const units = inlineTimeline([
      { kind: 'text', key: 'a', text: 'Hello' },
      tool('1', 'bash', 100),
      tool('2', 'bash', 100),
      { kind: 'text', key: 'b', text: 'Done' },
    ]);
    expect(weightOf(units, 0, units.length)).toBeLessThanOrEqual(SEGMENT_BUDGET);
    expect(replySegments(units)).toEqual([{ index: 0, count: 1, from: 0, to: units.length }]);
  });
});
