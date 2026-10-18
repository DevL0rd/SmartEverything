import { z } from 'zod';
import type { AiHarnessInteraction } from '@smarteverything/domain';
import { QUESTION_ANSWER } from './question-answer';

const PERMISSION_REQUEST = z.object({ tool_name: z.string() });
const QUESTIONS = z.object({
  questions: z.array(z.object({ id: z.string(), question: z.string() })),
});

export function reaskedReply(asked: AiHarnessInteraction, answer: unknown): string {
  if (asked.kind === 'permission') return permissionReply(asked.request, answer);
  const questions = QUESTIONS.parse(asked.request).questions;
  const lines = QUESTION_ANSWER.parse(answer).answers.map((item) => {
    const question = questions.find((entry) => entry.id === item.id)?.question ?? item.id;
    const chosen = [...item.selected, ...(item.custom === undefined ? [] : [item.custom])];
    return `${question} ${chosen.join(', ')}`;
  });
  return `The person answered the question you were waiting on when the chat moved to another machine:\n${lines.join('\n')}`;
}

function permissionReply(request: unknown, answer: unknown): string {
  const tool = PERMISSION_REQUEST.parse(request).tool_name;
  return answer === 'allowed-once'
    ? `The person approved ${tool}, which was waiting when the chat moved to another machine. Run it again.`
    : `The person did not approve ${tool}, which was waiting when the chat moved to another machine. Do not run it.`;
}
