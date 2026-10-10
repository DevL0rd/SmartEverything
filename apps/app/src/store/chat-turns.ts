import type {
  ChatActivityNotice,
  ChatActivityState,
  ChatStreamNotice,
  ChatStreamPart,
  ChatToolItem,
} from '@smarteverything/domain';

export interface Turn {
  readonly chatId: string;
  readonly turnId: string;
  readonly messageId: string | null;
  readonly state: ChatActivityState;
  readonly seq: number;
  readonly text: string;
  readonly reasoning: string;
  readonly tools: readonly ChatToolItem[];
  readonly steps: readonly string[];
  readonly reason: string | null;
  readonly behind: boolean;
  readonly waiting: readonly ChatStreamNotice[];
}

export type Turns = Readonly<Record<string, Turn>>;

const WAITING_MAX = 200;

function withTool(tools: readonly ChatToolItem[], tool: ChatToolItem): readonly ChatToolItem[] {
  const known = tools.some((item) => item.callId === tool.callId);
  return known
    ? tools.map((item) => (item.callId === tool.callId ? tool : item))
    : [...tools, tool];
}

function applyPart(turn: Turn, part: ChatStreamPart): Turn {
  switch (part.kind) {
    case 'text':
      return { ...turn, text: turn.text + part.delta, state: 'replying' };
    case 'reasoning':
      return { ...turn, reasoning: turn.reasoning + part.delta, state: 'thinking' };
    case 'tool': {
      const { kind: _kind, ...tool } = part;
      return { ...turn, tools: withTool(turn.tools, tool), state: 'tool' };
    }
  }
}

function applyFrame(turn: Turn, frame: ChatStreamNotice): Turn {
  return { ...frame.parts.reduce(applyPart, turn), seq: frame.seq };
}

function drain(turn: Turn): Turn {
  let current = turn;
  const waiting = [...current.waiting].sort((left, right) => left.seq - right.seq);
  const left: ChatStreamNotice[] = [];
  for (const frame of waiting) {
    if (frame.seq === current.seq + 1) {
      current = applyFrame(current, frame);
    } else if (frame.seq > current.seq + 1) {
      left.push(frame);
    }
  }
  return { ...current, waiting: left, behind: left.length > 0 };
}

function emptyTurn(frame: ChatStreamNotice): Turn {
  return {
    chatId: frame.chatId,
    turnId: frame.turnId,
    messageId: null,
    state: 'thinking',
    seq: 0,
    text: '',
    reasoning: '',
    tools: [],
    steps: [],
    reason: null,
    behind: true,
    waiting: [],
  };
}

export function withSnapshot(turns: Turns, notice: ChatActivityNotice): Turns {
  const previous = turns[notice.turnId];
  const kept = previous?.waiting.filter((frame) => frame.seq > notice.seq) ?? [];
  const turn: Turn = {
    chatId: notice.chatId,
    turnId: notice.turnId,
    messageId: notice.messageId,
    state: notice.state,
    seq: notice.seq,
    text: notice.draft,
    reasoning: notice.reasoning,
    tools: notice.tools,
    steps: notice.steps,
    reason: notice.reason,
    behind: false,
    waiting: kept,
  };
  const others = Object.entries(turns).filter(
    ([turnId, other]) =>
      turnId !== notice.turnId &&
      !(other.chatId === notice.chatId && other.state === 'idle') &&
      !(notice.messageId !== null && other.messageId === notice.messageId),
  );
  return { ...Object.fromEntries(others), [notice.turnId]: drain(turn) };
}

export function turnsOf(notices: readonly ChatActivityNotice[]): Turns {
  return notices.reduce<Turns>(withSnapshot, {});
}

export function withFrame(turns: Turns, frame: ChatStreamNotice): Turns {
  const turn = turns[frame.turnId] ?? emptyTurn(frame);
  if (frame.seq <= turn.seq) {
    return turns;
  }
  const waiting = [...turn.waiting, frame].slice(-WAITING_MAX);
  return { ...turns, [frame.turnId]: drain({ ...turn, waiting }) };
}

export function liveTurnOf(turns: Turns, chatId: string): Turn | null {
  const running = Object.values(turns).filter(
    (turn) => turn.chatId === chatId && turn.state !== 'idle',
  );
  return running.at(-1) ?? null;
}

export function turnForReply(turns: Turns, chatId: string, replyTo: string | null): Turn | null {
  const ofChat = Object.values(turns).filter((turn) => turn.chatId === chatId);
  return (
    (replyTo === null ? undefined : ofChat.find((turn) => turn.messageId === replyTo)) ??
    ofChat.find((turn) => turn.messageId === null) ??
    null
  );
}
