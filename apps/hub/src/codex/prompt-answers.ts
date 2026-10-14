import { z } from 'zod';
import { JSON_VALUE, type CodexPrompt, type CodexAnswer } from '@smarteverything/domain';
import type { RpcRecord } from './protocol';
import { CodexRuntimeError } from './errors';
export function codexAnswerResult(prompt: CodexPrompt, answer: CodexAnswer): RpcRecord {
  switch (answer.kind) {
    case 'approval':
      return approvalAnswer(prompt, answer.choice_id);
    case 'user_input':
      return userAnswer(prompt, answer.answers);
    case 'elicitation':
      return elicitationAnswer(prompt, answer);
  }
}
function approvalAnswer(prompt: CodexPrompt, id: string): RpcRecord {
  if (!('choices' in prompt))
    throw new CodexRuntimeError('answer', 'This Codex prompt is not an approval request.');
  const choice = prompt.choices.find((entry) => entry.id === id);
  if (choice === undefined)
    throw new CodexRuntimeError('answer', 'Choose one of the exact Codex approval decisions.');
  return prompt.kind === 'permissions_approval'
    ? z.record(z.string(), JSON_VALUE).parse(choice.value)
    : { decision: choice.value };
}
function userAnswer(
  prompt: CodexPrompt,
  answers: Readonly<Record<string, readonly string[]>>,
): RpcRecord {
  if (prompt.kind !== 'user_input')
    throw new CodexRuntimeError('answer', 'This Codex prompt does not ask user questions.');
  for (const [id, values] of Object.entries(answers)) {
    const question = prompt.questions.find((entry) => entry.id === id);
    if (question === undefined)
      throw new CodexRuntimeError('answer', 'The answer names an unknown Codex question.');
    if (
      !question.is_other &&
      question.options !== null &&
      values.some((value) => question.options?.some((option) => option.label === value) !== true)
    )
      throw new CodexRuntimeError('answer', 'Choose an answer offered by the Codex question.');
  }
  return {
    answers: Object.fromEntries(
      Object.entries(answers).map(([id, values]) => [id, { answers: [...values] }]),
    ),
  };
}
function elicitationAnswer(
  prompt: CodexPrompt,
  answer: Extract<CodexAnswer, { kind: 'elicitation' }>,
): RpcRecord {
  if (prompt.kind !== 'mcp_form' && prompt.kind !== 'mcp_url')
    throw new CodexRuntimeError('answer', 'This Codex prompt is not an MCP elicitation.');
  if (prompt.kind === 'mcp_form' && answer.action === 'accept')
    z.fromJSONSchema(prompt.schema).parse(answer.content);
  return { action: answer.action, content: answer.content ?? null, _meta: null };
}
