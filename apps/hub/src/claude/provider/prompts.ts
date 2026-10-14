import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderAnswer, ClaudePrompt } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import { systemClock } from '../../clock';
import { PromptBroker } from '../prompt-broker';

const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const ANSWER_OUTPUT = z.looseObject({
  hookSpecificOutput: z
    .looseObject({
      updatedInput: z.record(z.string(), JSON_VALUE).optional(),
      permissionDecision: z.enum(['allow', 'deny']).optional(),
      permissionDecisionReason: z.string().optional(),
      decision: z
        .discriminatedUnion('behavior', [
          z.object({ behavior: z.literal('allow') }),
          z.object({ behavior: z.literal('deny'), message: z.string().optional() }),
        ])
        .optional(),
    })
    .optional(),
});

export class ProviderPrompts {
  private readonly broker: PromptBroker;

  constructor(log: Logger, announce: (prompt: ClaudePrompt) => void) {
    this.broker = new PromptBroker({
      clock: systemClock,
      log,
      holdMs: PROMPT_TIMEOUT_MS,
      riskyHoldMs: PROMPT_TIMEOUT_MS,
      changed: (): void => {
        for (const prompt of this.broker.prompts()) {
          announce(prompt);
        }
      },
      raised: (): void => undefined,
      finished: announce,
    });
  }

  callback(session: () => string): CanUseTool {
    return async (toolName, input, context): Promise<PermissionResult> => {
      const request = {
        sessionId: session(),
        toolName,
        input: z.record(z.string(), JSON_VALUE).parse(input),
        cwd: null,
        event: toolName === 'AskUserQuestion' ? 'PreToolUse' : 'PermissionRequest',
      } as const;
      const output = ANSWER_OUTPUT.parse(await this.broker.hold(request, context.signal));
      const specific = output.hookSpecificOutput;
      if (specific?.permissionDecision === 'allow' || specific?.decision?.behavior === 'allow') {
        return {
          behavior: 'allow',
          updatedInput: specific.updatedInput ?? input,
          toolUseID: context.toolUseID,
        };
      }
      return {
        behavior: 'deny',
        message:
          specific?.permissionDecisionReason ?? 'The request was declined, cancelled, or expired.',
        toolUseID: context.toolUseID,
      };
    };
  }

  answer(id: string, answer: ProviderAnswer): boolean {
    if (answer.decision === 'dialog' || answer.decision === 'elicitation') return false;
    if (answer.decision === 'question') {
      this.broker.answerQuestion(id, answer.answers, 'owner');
      return true;
    }
    if (answer.decision === 'cancel') {
      this.broker.answer(id, { decision: 'deny', reason: 'Cancelled by the chat user.' }, 'owner');
    } else {
      this.broker.answer(id, answer, 'owner');
    }
    return true;
  }

  stop(): void {
    this.broker.stop();
  }
}
