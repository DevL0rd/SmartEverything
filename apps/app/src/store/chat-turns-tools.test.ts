import { describe, expect, it } from 'vitest';
import type { ChatActivityNotice, ChatStreamNotice, ChatToolItem } from '@smarteverything/domain';
import { sameActivity, turnsOf, withFrame, withSnapshot } from './chat-turns';
import { emptyState, type StoreState } from './state';
import { turnsOfChat } from './subscriptions';

const CHAT = 'chat';
const TURN = 'turn';
const NEXT = 'next';
const OTHER_CHAT = 'other';
const RUNS: readonly string[] = ['device_find', 'device_read', 'device_control'];

function tool(name: string, state: ChatToolItem['state']): ChatToolItem {
  return { callId: `${name}-call`, name, title: name, state, detail: null };
}

function notice(
  seq: number,
  state: ChatActivityNotice['state'],
  tools: readonly ChatToolItem[],
  messageId: string | null = null,
): ChatActivityNotice {
  return {
    type: 'chat_activity',
    chatId: CHAT,
    turnId: TURN,
    messageId,
    seq,
    state,
    steps: [],
    draft: '',
    reasoning: '',
    tools: [...tools],
    finish: null,
    reason: null,
  };
}

function toolCalls(finished: number, running: string | null): ChatActivityNotice {
  const done = RUNS.slice(0, finished).map((name) => tool(name, 'done'));
  const live = running === null ? [] : [tool(running, 'running')];
  return notice(Math.min(finished + 1, RUNS.length), 'tool', [...done, ...live]);
}

function noticeFor(
  settled: ChatActivityNotice,
  state: ChatActivityNotice['state'],
  messageId: string | null = null,
): ChatActivityNotice {
  return { ...settled, state, messageId };
}

const TURN_NOTICES: readonly ChatActivityNotice[] = [
  notice(0, 'thinking', []),
  toolCalls(0, RUNS[0] ?? ''),
  toolCalls(1, RUNS[1] ?? ''),
  toolCalls(2, RUNS[2] ?? ''),
];

const SETTLED = toolCalls(3, null);

const IDLE = noticeFor(SETTLED, 'idle');

function nextTurn(seq: number, messageId: string | null = null): ChatActivityNotice {
  return { ...notice(seq, 'thinking', [], messageId), turnId: NEXT };
}

function streamOf(source: ChatActivityNotice): ChatStreamNotice {
  return {
    type: 'chat_stream',
    chatId: source.chatId,
    turnId: source.turnId,
    seq: source.seq,
    parts: source.tools.map((item) => ({ kind: 'tool', ...item })),
  };
}

function elsewhere(chatId: string, seq = 0): ChatActivityNotice {
  return { ...notice(seq, 'thinking', []), chatId, turnId: `turn-${chatId}` };
}

function note(seq: number): ChatActivityNotice {
  return notice(seq, 'thinking', []);
}

function withState(notices: readonly ChatActivityNotice[]): StoreState {
  return { ...emptyState(), turns: turnsOf(notices) };
}

function rows(turns: StoreState['turns'], turnId = TURN): readonly ChatToolItem[] {
  return turns[turnId]?.tools ?? [];
}

describe('a turn that runs several tools', () => {
  it('adds each finished row without ever dropping the rows before it', () => {
    const listed = TURN_NOTICES.map((_entry, index) =>
      rows(withState(TURN_NOTICES.slice(0, index + 1)).turns).map((entry) => entry.name),
    );
    expect(listed).toStrictEqual([[], [RUNS[0]], [RUNS[0], RUNS[1]], [RUNS[0], RUNS[1], RUNS[2]]]);
  });

  it('keeps every row object it already showed when the next notice arrives', () => {
    const before = turnsOf(TURN_NOTICES);
    const after = withSnapshot(before, SETTLED);
    expect(rows(after)).toHaveLength(rows(before).length);
    expect(rows(after).slice(0, -1)).toStrictEqual(rows(before).slice(0, -1));
    expect(rows(after)[0]).toBe(rows(before)[0]);
    expect(rows(after)[0]?.state).toBe('done');
  });

  it('does not drop and re-add rows when a turn is re-sent unchanged', () => {
    const before = turnsOf([...TURN_NOTICES, SETTLED]);
    const after = withSnapshot(before, SETTLED);
    expect(after).toBe(before);
    expect(rows(after).every((entry, index) => entry === rows(before)[index])).toBe(true);
  });

  it('never lists a tool twice while it runs', () => {
    const running = toolCalls(1, RUNS[1] ?? '');
    const names = rows(turnsOf([...TURN_NOTICES.slice(0, 3), running, running])).map(
      (entry) => entry.name,
    );
    expect(names).toStrictEqual([RUNS[0], RUNS[1]]);
  });

  it('reports a notice that changes nothing as unchanged', () => {
    const ran = turnsOf(TURN_NOTICES);
    expect(sameActivity(ran[TURN], SETTLED)).toBe(true);
    expect(sameActivity(ran[TURN], notice(0, 'thinking', []))).toBe(false);
    expect(sameActivity(turnsOf([...TURN_NOTICES, IDLE])[TURN], SETTLED)).toBe(false);
  });
});

describe('a turn whose tools finish', () => {
  it('hands out one turns object for the chat while nothing it reads changed', () => {
    const state = withState([...TURN_NOTICES, SETTLED]);
    expect(turnsOfChat(state, CHAT)).toBe(turnsOfChat(state, CHAT));
  });

  it('hands out the same chat turns while another chat reports activity', () => {
    const state = { ...emptyState(), turns: turnsOf([...TURN_NOTICES, SETTLED]) };
    const first = turnsOfChat(state, CHAT);
    state.turns = withFrame(state.turns, streamOf(elsewhere(OTHER_CHAT)));
    state.turns = withFrame(state.turns, streamOf(elsewhere(OTHER_CHAT, 1)));
    expect(state.turns[`turn-${OTHER_CHAT}`]?.seq).toBe(1);
    expect(turnsOfChat(state, CHAT)).toBe(first);
  });

  it('gives another chat its own object when that chat changes', () => {
    const before = turnsOf([...TURN_NOTICES, SETTLED, elsewhere(OTHER_CHAT)]);
    const after = turnsOf([
      ...TURN_NOTICES,
      SETTLED,
      elsewhere(OTHER_CHAT),
      { ...elsewhere(OTHER_CHAT, 1), draft: 'more' },
    ]);
    const first = turnsOfChat({ ...emptyState(), turns: before }, OTHER_CHAT);
    const second = turnsOfChat({ ...emptyState(), turns: after }, OTHER_CHAT);
    expect(second).not.toBe(first);
    expect(second).toStrictEqual({ ...first, [`turn-${OTHER_CHAT}`]: after[`turn-${OTHER_CHAT}`] });
  });
});

describe('a finished turn', () => {
  const finished = [...TURN_NOTICES, SETTLED, IDLE];

  it('keeps its own rows while a next turn works in the same chat', () => {
    const claimed = turnsOf([
      ...finished,
      { ...noticeFor(SETTLED, 'idle', 'next-message'), turnId: NEXT },
    ]);
    expect(claimed[TURN]?.state).toBe('idle');
    expect(claimed[TURN]?.tools).toHaveLength(3);
    expect(claimed[TURN]?.messageId).toBeNull();
    expect(claimed[NEXT]?.state).toBe('idle');
  });

  it('stays when another chat reports activity', () => {
    const state = { ...emptyState(), turns: turnsOf([...finished, IDLE]) };
    const first = turnsOfChat(state, CHAT);
    const turns = turnsOf([...finished, IDLE, elsewhere(OTHER_CHAT)]);
    const moved = { ...state, turns };
    expect(turnsOfChat(moved, CHAT)[TURN]?.state).toBe('idle');
    expect(turnsOfChat(moved, CHAT)[TURN]?.tools).toHaveLength(3);
    expect(first[TURN]?.state).toBe('idle');
  });

  it('is replaced only by the turn that claims its message', () => {
    const claimedMessage = noticeFor(SETTLED, 'idle', 'message');
    const claim = { ...nextTurn(4, 'message'), state: 'tool' as const };
    const turns = turnsOf([...TURN_NOTICES, claimedMessage, claim]);
    expect(turns[TURN]).toBeUndefined();
    expect(turns[NEXT]?.messageId).toBe('message');
  });

  it('keeps the turn of another chat that claims the same message', () => {
    const shared = { ...note(0), messageId: 'shared' };
    const other = { ...shared, chatId: OTHER_CHAT, turnId: 'turn-other' };
    const claim = { ...shared, turnId: NEXT, state: 'tool' as const };
    const turns = turnsOf([shared, other, claim]);
    expect(turns['turn-other']).toBeDefined();
    expect(turns[TURN]).toBeUndefined();
    expect(turns[NEXT]?.messageId).toBe('shared');
  });
});
