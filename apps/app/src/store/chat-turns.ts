import {
  CHAT_RETRYING_REASON,
  CHAT_WAITING_HELPERS_REASON,
  CHAT_WAITING_JOBS_REASON,
  type AssistantMessageRow,
  type ChatActivityNotice,
  type ChatActivityState,
  type ChatStreamNotice,
  type ChatStreamPart,
  type ChatToolItem,
} from '@smarteverything/domain';
import { sameJson } from './same-json';

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

export function isWorking(turn: Turn): boolean {
  return turn.state !== 'idle' && turn.state !== 'failed';
}

function acknowledged(
  turn: Turn,
  messages: Readonly<Record<string, AssistantMessageRow>>,
): boolean {
  if (isWorking(turn)) return false;
  if (turn.messageId === null) return !turn.behind;
  const row = messages[turn.messageId];
  return row?.chat_id === turn.chatId && (row.state === 'answered' || row.state === 'failed');
}

export function retainPendingTurns(
  turns: Turns,
  messages: Readonly<Record<string, AssistantMessageRow>>,
): Turns {
  for (const id in turns) {
    const turn = turns[id];
    if (turn !== undefined && acknowledged(turn, messages))
      return Object.fromEntries(
        Object.entries(turns).filter(([, entry]) => !acknowledged(entry, messages)),
      );
  }
  return turns;
}

export interface WorkStatus {
  readonly phase: string;
  readonly step: string | null;
}

const REASON_PHASES: Readonly<Record<string, string>> = {
  [CHAT_RETRYING_REASON]: 'Retrying',
  [CHAT_WAITING_HELPERS_REASON]: 'Waiting on helpers',
  [CHAT_WAITING_JOBS_REASON]: 'Waiting on background jobs',
};

function phaseOf(turn: Turn): string {
  const reasoned = turn.reason === null ? undefined : REASON_PHASES[turn.reason];
  if (reasoned !== undefined) return reasoned;
  if (turn.state !== 'thinking') return 'Working';
  const started = turn.reasoning !== '' || turn.text !== '' || turn.tools.length > 0;
  return started ? 'Thinking' : 'Waiting for response';
}

export function workStatusOf(turn: Turn): WorkStatus {
  return {
    phase: phaseOf(turn),
    step:
      turn.tools.findLast((tool) => tool.state === 'running')?.title ?? turn.steps.at(-1) ?? null,
  };
}

export function workText(work: WorkStatus): string {
  return work.step === null ? work.phase : `${work.phase} · ${work.step}`;
}

export function workKey(turn: Turn | undefined): string | null {
  return turn === undefined || !isWorking(turn)
    ? null
    : `${turn.chatId}\u0000${workText(workStatusOf(turn))}`;
}

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
      return { ...turn, text: turn.text + part.delta, state: 'replying', reason: null };
    case 'reasoning':
      return { ...turn, reasoning: turn.reasoning + part.delta, state: 'thinking', reason: null };
    case 'tool': {
      const { kind: _kind, ...tool } = part;
      return { ...turn, tools: withTool(turn.tools, tool), state: 'tool', reason: null };
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
  const behind = left.length > 0;
  if (current === turn && !behind && turn.waiting.length === 0) return turn;
  return { ...current, waiting: left, behind };
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

function toolsWith(previous: Turn | undefined, tools: readonly ChatToolItem[]): ChatToolItem[] {
  if (previous === undefined) return [...tools];
  return tools.map((tool) => {
    const before = previous.tools.find((item) => item.callId === tool.callId);
    return before !== undefined && sameJson(before, tool) ? before : tool;
  });
}

function snapshotOf(previous: Turn | undefined, notice: ChatActivityNotice): Turn {
  const kept = previous?.waiting.filter((frame) => frame.seq > notice.seq) ?? [];
  return drain({
    chatId: notice.chatId,
    turnId: notice.turnId,
    messageId: notice.messageId,
    state: notice.state,
    seq: notice.seq,
    text: notice.draft,
    reasoning: notice.reasoning,
    tools: toolsWith(previous, notice.tools),
    steps: notice.steps,
    reason: notice.reason,
    behind: false,
    waiting: kept,
  });
}

export function sameActivity(turn: Turn | undefined, notice: ChatActivityNotice): boolean {
  return (
    turn?.chatId === notice.chatId &&
    turn.messageId === notice.messageId &&
    turn.state === notice.state &&
    turn.seq === notice.seq &&
    turn.text === notice.draft &&
    turn.reasoning === notice.reasoning &&
    turn.reason === notice.reason
  );
}

function superseded(other: Turn, turn: Turn): boolean {
  return (
    other.chatId === turn.chatId && turn.messageId !== null && other.messageId === turn.messageId
  );
}

function withTurn(turns: Turns, turn: Turn): Turns {
  const next: Record<string, Turn> = {};
  for (const [turnId, other] of Object.entries(turns)) {
    if (turnId !== turn.turnId && !superseded(other, turn)) next[turnId] = other;
  }
  next[turn.turnId] = turn;
  return next;
}

function settlesBehind(turns: Turns, previous: Turn, notice: ChatActivityNotice): Turns {
  if (notice.state !== 'idle' || notice.tools.length > 0) return turns;
  if (notice.messageId !== null && notice.messageId !== previous.messageId) return turns;
  if (previous.state === 'idle') return turns;
  return { ...turns, [notice.turnId]: { ...previous, state: 'idle' } };
}

export function withSnapshot(turns: Turns, notice: ChatActivityNotice): Turns {
  const previous = turns[notice.turnId];
  if (previous !== undefined && previous.seq > notice.seq)
    return settlesBehind(turns, previous, notice);
  if (previous !== undefined && sameActivity(previous, notice)) return turns;
  return withTurn(turns, snapshotOf(previous, notice));
}

export function turnsOf(notices: readonly ChatActivityNotice[]): Turns {
  return notices.reduce<Turns>((turns, notice) => withSnapshot(turns, notice), {});
}

export function settleChatTurns(turns: Turns, observed: Turns, chatId: string): Turns {
  const settled = Object.values(turns).filter(
    (turn) =>
      turn.chatId === chatId &&
      turn.state !== 'idle' &&
      turn.state !== 'failed' &&
      turn === observed[turn.turnId],
  );
  if (settled.length === 0) return turns;
  return {
    ...turns,
    ...Object.fromEntries(
      settled.map((turn) => [turn.turnId, { ...turn, state: 'idle' as const }]),
    ),
  };
}

export function withFrame(turns: Turns, frame: ChatStreamNotice): Turns {
  const turn = turns[frame.turnId] ?? emptyTurn(frame);
  if (frame.seq <= turn.seq) {
    return turns;
  }
  if (frame.seq === turn.seq + 1 && turn.waiting.length === 0) {
    return { ...turns, [frame.turnId]: { ...applyFrame(turn, frame), behind: false } };
  }
  const waiting = [...turn.waiting, frame].slice(-WAITING_MAX);
  return { ...turns, [frame.turnId]: drain({ ...turn, waiting }) };
}

const workingIn = new WeakMap<Turns, Map<string, Turn | null>>();

export function workingTurnOf(turns: Turns, chatId: string): Turn | null {
  const known = workingIn.get(turns);
  const cached = known?.get(chatId);
  if (cached !== undefined) return cached;
  const found =
    Object.values(turns).findLast((turn) => turn.chatId === chatId && isWorking(turn)) ?? null;
  const cache = known ?? new Map<string, Turn | null>();
  cache.set(chatId, found);
  workingIn.set(turns, cache);
  return found;
}

export function liveTurnOf(turns: Turns, chatId: string): Turn | null {
  const running = Object.values(turns).filter(
    (turn) => turn.chatId === chatId && turn.state !== 'idle',
  );
  return running.at(-1) ?? null;
}
