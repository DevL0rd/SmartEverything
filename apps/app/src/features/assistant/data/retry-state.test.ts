import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { emptyState, type StoreState } from '../../../store/state';
import { tableOf } from '../../../store/table-ops';
import { RULES } from '../../../store/table-rules';
import { latestPersonId } from './retry-state';

function message(
  id: string,
  chat: string,
  role: AssistantMessageRow['role'],
  minute: number,
): AssistantMessageRow {
  const at = `2026-10-09T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role,
    kind: 'text',
    author: 'x',
    text: 'hello',
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chat,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
  };
}

function stateOf(rows: readonly AssistantMessageRow[]): StoreState {
  const state = emptyState();
  return {
    ...state,
    tables: {
      ...state.tables,
      assistant_messages: tableOf(rows, RULES.assistant_messages, 1),
    },
  };
}

describe('latestPersonId', () => {
  const state = stateOf([
    message('a1', 'a', 'person', 1),
    message('a2', 'a', 'responder', 2),
    message('a3', 'a', 'person', 3),
    message('b1', 'b', 'person', 4),
  ]);

  it('finds the newest person message of each chat', () => {
    expect(latestPersonId(state, 'a')).toBe('a3');
    expect(latestPersonId(state, 'b')).toBe('b1');
    expect(latestPersonId(state, 'c')).toBeNull();
  });

  it('follows a new table version', () => {
    const next = stateOf([message('a4', 'a', 'person', 5), message('a1', 'a', 'person', 1)]);
    expect(latestPersonId(next, 'a')).toBe('a4');
    expect(latestPersonId(state, 'a')).toBe('a3');
  });
});
