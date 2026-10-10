import type { ToolAnswer } from '../../../assistant-voice/tool-answer';
import type { TurnTool } from '../../../assistant-voice/turn-session';
import { TOO_LATE, failedTool } from './conversation-text';
import type { DeskAnswer, DeskTool } from './conversation-types';
import type { BodyOutcome, Turn } from './turn';

export interface ToolDesk {
  readonly turn: () => Turn | null;
  readonly markEnding: () => void;
  readonly shape: (turn: Turn, answer: DeskAnswer) => void;
  readonly deliver: (outcome: BodyOutcome) => boolean;
}

function applied(desk: ToolDesk, answer: DeskAnswer): ToolAnswer {
  if (answer.end === true) {
    desk.markEnding();
  }
  const turn = desk.turn();
  if (turn !== null) {
    desk.shape(turn, answer);
  }
  const late: DeskAnswer | null =
    answer.outcome !== undefined && !desk.deliver(answer.outcome)
      ? { result: { error: TOO_LATE[answer.outcome.kind] } }
      : null;
  const told = late ?? answer;
  return { response: told.result, line: told.line ?? '', pictures: [] };
}

function run(
  desk: ToolDesk,
  tool: DeskTool,
  args: Readonly<Record<string, string>>,
): Promise<ToolAnswer> {
  let answer: DeskAnswer | Promise<DeskAnswer>;
  try {
    answer = tool.answer(args);
  } catch (error) {
    answer = failedTool(error);
  }
  if (answer instanceof Promise) {
    desk.turn()?.expectAnswer();
    return answer.catch(failedTool).then((settled) => applied(desk, settled));
  }
  return Promise.resolve(applied(desk, answer));
}

export function wrapTool(desk: ToolDesk, tool: DeskTool): TurnTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    delivery: tool.delivery,
    run: (args) => run(desk, tool, args),
  };
}
