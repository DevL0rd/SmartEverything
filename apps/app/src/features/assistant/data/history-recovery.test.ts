import { describe, expect, it } from 'vitest';
import { ASSISTANT_MESSAGE_ROW, type AssistantMessageRow } from '@smarteverything/domain';
import { recoverPages } from './history-recovery';

const CHAT = '00000000-0000-4000-8000-000000000001';

function row(second: number): AssistantMessageRow {
  const at = new Date(Date.UTC(2026, 10, 5, 1, 0, second)).toISOString();
  return ASSISTANT_MESSAGE_ROW.parse({
    id: `00000000-0000-4000-8000-${String(second + 1).padStart(12, '0')}`,
    chat_id: CHAT,
    profile_id: CHAT,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Pat',
    text: 'Test',
    attachments: [],
    state: 'answered',
    reason: null,
    steps: [],
    reply_to: null,
    quote: null,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
  });
}

const HISTORY = Array.from({ length: 140 }, (_, index) => row(140 - index));

function loader(
  calls: (string | undefined)[],
): (before: string | undefined) => Promise<readonly AssistantMessageRow[]> {
  return (before) => {
    calls.push(before);
    return Promise.resolve(
      HISTORY.filter(({ created_at }) => before === undefined || created_at < before).slice(0, 50),
    );
  };
}

describe('older history recovery', () => {
  it('bridges the gap made when the bounded live snapshot advances', async () => {
    const calls: (string | undefined)[] = [];
    const recovered = await recoverPages({
      first: row(81).created_at,
      through: row(11).created_at,
      additionalPage: false,
      current: () => true,
      load: loader(calls),
    });
    expect(calls).toEqual([row(81).created_at, row(31).created_at]);
    expect(recovered?.rows).toEqual(HISTORY.slice(60));
  });

  it('loads the newest page when the live snapshot has no rows in the chat', async () => {
    const calls: (string | undefined)[] = [];
    const recovered = await recoverPages({
      first: undefined,
      through: row(11).created_at,
      additionalPage: false,
      current: () => true,
      load: loader(calls),
    });
    expect(calls).toEqual([undefined, row(91).created_at, row(41).created_at]);
    expect(recovered?.rows).toEqual(HISTORY);
  });

  it('stops a superseded recovery without reusing its page', async () => {
    let current = true;
    const recovered = await recoverPages({
      first: undefined,
      through: row(11).created_at,
      additionalPage: false,
      current: () => current,
      load: () => {
        current = false;
        return Promise.resolve(HISTORY.slice(0, 50));
      },
    });
    expect(recovered).toBeNull();
  });
});
