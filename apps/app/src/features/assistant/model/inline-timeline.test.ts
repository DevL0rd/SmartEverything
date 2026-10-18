import { describe, expect, it } from 'vitest';
import type { ChatTimelinePart, ChatTimelineTool } from '@smarteverything/domain';
import { inlineTimeline, streamingKey } from './inline-timeline';

function tool(id: string, imageOperationId: string | null = null): ChatTimelinePart {
  const value: ChatTimelineTool = {
    callId: id,
    name: 'read',
    title: 'Read',
    state: 'done',
    detail: null,
    input: null,
    output: null,
    redacted: false,
    image_operation_id: imageOperationId,
  };
  return { kind: 'tool', key: `tool-${id}`, tool: value };
}

const text = (key: string, value: string): ChatTimelinePart => ({ kind: 'text', key, text: value });
const thought = (key: string): ChatTimelinePart => ({
  kind: 'reasoning',
  key,
  text: 'Weighing it',
});

describe('inlineTimeline', () => {
  it('puts consecutive tools in one group until real text', () => {
    const parts = inlineTimeline([tool('a'), tool('b'), tool('c'), text('t1', 'Done.'), tool('d')]);
    expect(parts.map((part) => part.kind)).toEqual(['tools', 'text', 'tools']);
    expect(parts[0]?.kind === 'tools' ? parts[0].tools.length : 0).toBe(3);
  });

  it('ignores blank text so it does not split a group', () => {
    const parts = inlineTimeline([tool('a'), text('t1', '  \n'), tool('b')]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.kind === 'tools' ? parts[0].tools.length : 0).toBe(2);
  });

  it('keeps thinking after a tool inside that group as an activity', () => {
    const parts = inlineTimeline([tool('a'), thought('r1'), tool('b')]);
    expect(parts).toHaveLength(1);
    const group = parts[0];
    expect(group?.kind === 'tools' ? group.activities.map((entry) => entry.kind) : []).toEqual([
      'tool',
      'reasoning',
      'tool',
    ]);
  });

  it('leaves thinking before the first tool as its own part', () => {
    const parts = inlineTimeline([thought('r1'), tool('a')]);
    expect(parts.map((part) => part.kind)).toEqual(['reasoning', 'tools']);
  });

  it('keeps a single tool as a group of one so it renders without a wrapper', () => {
    const parts = inlineTimeline([tool('a'), text('t1', 'Hello')]);
    expect(parts[0]?.kind === 'tools' ? parts[0].tools.length : 0).toBe(1);
  });

  it('ends a group at an image and keeps later tools in a new group', () => {
    const parts = inlineTimeline([tool('a', '00000000-0000-4000-8000-000000000001'), tool('b')]);
    expect(parts.map((part) => part.kind)).toEqual(['tools', 'image', 'tools']);
  });
});

describe('streamingKey', () => {
  const group = inlineTimeline([tool('a'), tool('b')]);

  it('marks the last part as streaming while the reply is live', () => {
    expect(streamingKey(group, true)).toBe('tool-a');
  });

  it('stops marking the group once text follows it', () => {
    const parts = inlineTimeline([tool('a'), tool('b'), text('t1', 'Done.')]);
    expect(streamingKey(parts, true)).toBe('t1');
  });

  it('marks nothing when the reply is not live', () => {
    expect(streamingKey(group, false)).toBeNull();
  });
});
