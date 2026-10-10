import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { contextTone, filesLabel, footerFacts, repliesLabel } from './chat-footer';

const FILE: AssistantMessageRow['attachments'][number] = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'photo.png',
  mime: 'image/png',
  bytes: 1200,
  width: null,
  height: null,
};

type Row = Pick<AssistantMessageRow, 'role' | 'attachments'>;

const person: Row = { role: 'person', attachments: [FILE, FILE] };
const reply: Row = { role: 'responder', attachments: [] };
const replyWithFile: Row = { role: 'responder', attachments: [FILE] };

describe('footerFacts', () => {
  it('is hidden for a chat with no cost and no context, even with replies', () => {
    expect(footerFacts({ cost_micros: 0, context_percent: null }, [person, reply])).toBeNull();
  });

  it('shows the chat total and counts replies and files', () => {
    expect(
      footerFacts({ cost_micros: 120_000, context_percent: 42 }, [person, reply, replyWithFile]),
    ).toEqual({ costMicros: 120_000, context: 42, replies: 2, files: 3 });
  });

  it('shows with only a context reading, even at zero', () => {
    expect(footerFacts({ cost_micros: 0, context_percent: 0 }, [])).toEqual({
      costMicros: 0,
      context: 0,
      replies: 0,
      files: 0,
    });
  });

  it('shows with only a cost', () => {
    expect(footerFacts({ cost_micros: 5, context_percent: null }, [reply])?.replies).toBe(1);
  });
});

describe('footer labels', () => {
  it('warns from the shared context threshold', () => {
    expect(contextTone(79)).toBe('primary');
    expect(contextTone(80)).toBe('warning');
  });

  it('pluralises', () => {
    expect(repliesLabel(1)).toBe('1 reply');
    expect(repliesLabel(12)).toBe('12 replies');
    expect(filesLabel(1)).toBe('1 file');
    expect(filesLabel(3)).toBe('3 files');
  });
});
