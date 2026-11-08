import { describe, expect, it } from 'vitest';
import type { AiMemory, AiMemoryList } from '@smarteverything/domain';
import { mayChange, memoriesIn, MEMORY_SCOPES, promptCharsOf, sortMemories } from './memory-model';

function memory(id: string, scope: AiMemory['scope'], updated: string, importance = 50): AiMemory {
  return {
    id,
    scope,
    text: `fact ${id}`,
    source_chat_id: null,
    source_message_id: null,
    kind: 'fact',
    importance,
    happened_on: null,
    valid_until: null,
    recalled_at: null,
    recall_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: updated,
  };
}

const list: AiMemoryList = {
  settings: { enabled: true, prompt_chars: null },
  memories: [
    memory('00000000-0000-4000-8000-000000000001', 'person', '2026-10-02T00:00:00Z'),
    memory('00000000-0000-4000-8000-000000000002', 'home', '2026-10-05T00:00:00Z'),
    memory('00000000-0000-4000-8000-000000000003', 'person', '2026-10-09T00:00:00Z'),
  ],
};

describe('memory page model', () => {
  it('splits memories by scope in the chosen order without touching the list', () => {
    expect(memoriesIn(list, 'person', 'newest').map((row) => row.id.slice(-1))).toStrictEqual([
      '3',
      '1',
    ]);
    expect(memoriesIn(list, 'person', 'oldest').map((row) => row.id.slice(-1))).toStrictEqual([
      '1',
      '3',
    ]);
    expect(memoriesIn(list, 'home', 'importance').map((row) => row.id.slice(-1))).toStrictEqual([
      '2',
    ]);
    expect(list.memories.map((row) => row.id.slice(-1))).toStrictEqual(['1', '2', '3']);
  });

  it('sorts by importance high to low, equal importance newest first', () => {
    const rows = [
      memory('00000000-0000-4000-8000-000000000001', 'person', '2026-10-01T00:00:00Z', 40),
      memory('00000000-0000-4000-8000-000000000002', 'person', '2026-10-02T00:00:00Z', 90),
      memory('00000000-0000-4000-8000-000000000003', 'person', '2026-10-03T00:00:00Z', 40),
      memory('00000000-0000-4000-8000-000000000004', 'person', '2026-10-04T00:00:00Z', 5),
    ];
    expect(sortMemories(rows, 'importance').map((row) => row.id.slice(-1))).toStrictEqual([
      '2',
      '3',
      '1',
      '4',
    ]);
    expect(sortMemories(rows, 'newest').map((row) => row.id.slice(-1))).toStrictEqual([
      '4',
      '3',
      '2',
      '1',
    ]);
    expect(sortMemories(rows, 'oldest').map((row) => row.id.slice(-1))).toStrictEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(rows.map((row) => row.id.slice(-1))).toStrictEqual(['1', '2', '3', '4']);
  });

  it('lets every person change their own memories and only owners change home memories', () => {
    expect(mayChange('person', false)).toBe(true);
    expect(mayChange('home', false)).toBe(false);
    expect(mayChange('home', true)).toBe(true);
  });

  it('shows the shared home section before the personal section', () => {
    expect(MEMORY_SCOPES).toStrictEqual(['home', 'person']);
  });

  it('reads the prompt size as a safe positive decimal, empty meaning default', () => {
    expect(promptCharsOf(' 2000 ')).toBe(2000);
    expect(promptCharsOf('')).toBeNull();
    expect(promptCharsOf('0')).toBeUndefined();
    expect(promptCharsOf('1.5')).toBeUndefined();
    expect(promptCharsOf('1e6')).toBeUndefined();
    expect(promptCharsOf('0xff')).toBeUndefined();
    expect(promptCharsOf('9007199254740992')).toBeUndefined();
    expect(promptCharsOf('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(promptCharsOf('lots')).toBeUndefined();
  });
});
