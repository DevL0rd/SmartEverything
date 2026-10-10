import type { ChatActivityState, ChatToolItem } from '@smarteverything/domain';
import { liveTurnOf, type Turns } from '../../../store/chat-turns';
import { statusIsLive } from './work-steps';

export interface StatusDockView {
  readonly state: ChatActivityState;
  readonly tools: readonly ChatToolItem[];
  readonly reasoning: string;
  readonly behind: boolean;
}

export function statusDockOf(turns: Turns, chatId: string): StatusDockView | null {
  const turn = liveTurnOf(turns, chatId);
  if (turn === null || !statusIsLive(turn.state)) {
    return null;
  }
  return {
    state: turn.state,
    tools: turn.tools,
    reasoning: turn.reasoning,
    behind: turn.behind,
  };
}

export function sameStatusDock(left: StatusDockView | null, right: StatusDockView | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.state === right.state &&
    left.tools === right.tools &&
    left.reasoning === right.reasoning &&
    left.behind === right.behind
  );
}
