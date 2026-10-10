import { ASSISTANT_STEPS_KEPT } from './assistant';
import type { ChatStepOutcome, ChatToolItem } from './ai-chats';

export type ToolOutcome = 'running' | ChatStepOutcome;

export interface SettledStep {
  readonly title: string;
  readonly outcome: ChatStepOutcome;
}

function outcomeOf(tool: ChatToolItem, later: readonly ChatToolItem[]): ToolOutcome {
  if (tool.state !== 'failed') {
    return tool.state;
  }
  const recovered = later.some((next) => next.name === tool.name && next.state === 'done');
  return recovered ? 'retried' : 'failed';
}

export function toolOutcomes(tools: readonly ChatToolItem[]): readonly ToolOutcome[] {
  return tools.map((tool, index, all) => outcomeOf(tool, all.slice(index + 1)));
}

function worse(left: ChatStepOutcome, right: ChatStepOutcome): ChatStepOutcome {
  if (left === 'failed' || right === 'failed') {
    return 'failed';
  }
  return left === 'retried' || right === 'retried' ? 'retried' : 'done';
}

function settledOf(tool: ChatToolItem, later: readonly ChatToolItem[]): SettledStep {
  const outcome = outcomeOf(tool, later);
  return { title: tool.title, outcome: outcome === 'running' ? 'failed' : outcome };
}

export function settledSteps(tools: readonly ChatToolItem[]): readonly SettledStep[] {
  const steps = tools
    .map((tool, index, all) => settledOf(tool, all.slice(index + 1)))
    .reduce<readonly SettledStep[]>((kept, step) => {
      const last = kept.at(-1);
      return last?.title === step.title
        ? [...kept.slice(0, -1), { title: step.title, outcome: worse(last.outcome, step.outcome) }]
        : [...kept, step];
    }, []);
  return steps.slice(-ASSISTANT_STEPS_KEPT);
}
