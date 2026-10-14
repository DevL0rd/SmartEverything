import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CODEX_PROMPT,
  CODEX_ANSWER,
  type CodexPrompt,
  type CodexAnswer,
} from '@smarteverything/domain';
import { CodexRuntimeError } from './errors';
import { type CodexClient } from './client';
import { type RpcId, type RpcRecord, rpcIdentity } from './protocol';
import {
  PROMPT_SCOPE,
  COMMAND_APPROVAL,
  FILE_APPROVAL,
  PERMISSION_APPROVAL,
  USER_INPUT,
} from './prompt-schemas';
import { codexAnswerResult } from './prompt-answers';
interface Pending {
  readonly prompt: CodexPrompt;
}
export class CodexPrompts {
  private readonly pending = new Map<string, Pending>();
  constructor(
    private readonly client: CodexClient,
    private readonly publish: (prompt: CodexPrompt) => void,
  ) {}
  receive(method: string, params: RpcRecord, id: RpcId): CodexPrompt {
    if (this.pending.size >= 500)
      throw new CodexRuntimeError('prompt', 'Codex pending prompt capacity reached.');
    if (
      [...this.pending.values()].some(
        (entry) => rpcIdentity(entry.prompt.rpc_id) === rpcIdentity(id),
      )
    )
      throw new CodexRuntimeError('prompt', 'Codex repeated a pending server request ID.');
    const prompt = normalizePrompt(method, params, id);
    if (prompt.kind === 'unsupported') {
      this.client.reject(id, prompt.reason);
      this.publish({ ...prompt, status: 'expired' });
      return prompt;
    }
    this.pending.set(prompt.id, { prompt });
    this.publish(prompt);
    return prompt;
  }
  list(threadId?: string): CodexPrompt[] {
    return [...this.pending.values()]
      .map((entry) => entry.prompt)
      .filter((prompt) => threadId === undefined || prompt.thread_id === threadId);
  }
  answer(id: string, raw: CodexAnswer): void {
    const answer = CODEX_ANSWER.parse(raw);
    const pending = this.pending.get(id);
    if (pending === undefined)
      throw new CodexRuntimeError(
        'answer',
        'This Codex prompt expired or belongs to another process.',
      );
    const result = codexAnswerResult(pending.prompt, answer);
    this.client.respond(pending.prompt.rpc_id, result);
    this.pending.delete(id);
    this.publish({ ...pending.prompt, status: 'answered' });
  }
  resolved(params: RpcRecord): string | null {
    const value = z
      .object({ threadId: z.string(), requestId: z.union([z.string(), z.int()]) })
      .parse(params);
    for (const [id, entry] of this.pending)
      if (
        entry.prompt.thread_id === value.threadId &&
        rpcIdentity(entry.prompt.rpc_id) === rpcIdentity(value.requestId)
      ) {
        this.pending.delete(id);
        this.publish({ ...entry.prompt, status: 'expired' });
        return id;
      }
    return null;
  }
  expire(threadId?: string): void {
    for (const [id, entry] of this.pending)
      if (threadId === undefined || entry.prompt.thread_id === threadId) {
        this.pending.delete(id);
        this.publish({ ...entry.prompt, status: 'expired' });
      }
  }
}
function base(params: RpcRecord, id: RpcId): Omit<CodexPrompt, 'kind'> {
  const scope = PROMPT_SCOPE.parse(params);
  return {
    id: randomUUID(),
    rpc_id: id,
    thread_id: scope.threadId,
    turn_id: scope.turnId ?? null,
    item_id: scope.itemId ?? null,
    status: 'pending',
    title: 'Codex needs your response',
    payload: params,
  };
}
function normalizePrompt(method: string, params: RpcRecord, id: RpcId): CodexPrompt {
  const common = base(params, id);
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return commandPrompt(common, params);
    case 'item/fileChange/requestApproval':
      FILE_APPROVAL.parse(params);
      return CODEX_PROMPT.parse({
        ...common,
        kind: 'file_approval',
        choices: ['accept', 'acceptForSession', 'decline', 'cancel'].map((value) => ({
          id: value,
          label: value,
          value,
        })),
      });
    case 'item/permissions/requestApproval':
      return permissionPrompt(common, params);
    case 'item/tool/requestUserInput':
      return userPrompt(common, params);
    case 'mcpServer/elicitation/request':
      return mcpPrompt(common, params);
    default:
      return CODEX_PROMPT.parse({
        ...common,
        kind: 'unsupported',
        reason: `The Codex request ${method} is not implemented.`,
      });
  }
}
function commandPrompt(common: Omit<CodexPrompt, 'kind'>, params: RpcRecord): CodexPrompt {
  const request = COMMAND_APPROVAL.parse(params);
  const decisions = request.availableDecisions ?? [
    'accept',
    'acceptForSession',
    'decline',
    'cancel',
  ];
  return CODEX_PROMPT.parse({
    ...common,
    kind: 'command_approval',
    choices: decisions.map((value, index) => ({
      id: String(index),
      label: typeof value === 'string' ? value : JSON.stringify(value),
      value,
    })),
  });
}
function permissionPrompt(common: Omit<CodexPrompt, 'kind'>, params: RpcRecord): CodexPrompt {
  const requested = PERMISSION_APPROVAL.parse(params).permissions;
  const permissions = {
    ...(requested.network === null ? {} : { network: requested.network }),
    ...(requested.fileSystem === null ? {} : { fileSystem: requested.fileSystem }),
  };
  return CODEX_PROMPT.parse({
    ...common,
    kind: 'permissions_approval',
    choices: [
      { id: 'deny', label: 'Deny', value: { permissions: {}, scope: 'turn' } },
      { id: 'turn', label: 'Allow for this turn', value: { permissions, scope: 'turn' } },
      { id: 'session', label: 'Allow for this session', value: { permissions, scope: 'session' } },
    ],
  });
}
function userPrompt(common: Omit<CodexPrompt, 'kind'>, params: RpcRecord): CodexPrompt {
  const questions = USER_INPUT.parse(params).questions.map((question) => ({
    id: question.id,
    header: question.header,
    question: question.question,
    is_other: question.isOther,
    is_secret: question.isSecret,
    options: question.options,
  }));
  return CODEX_PROMPT.parse({ ...common, kind: 'user_input', questions });
}
function mcpPrompt(common: Omit<CodexPrompt, 'kind'>, params: RpcRecord): CodexPrompt {
  const mode = z.string().parse(params['mode']);
  if (mode === 'url') return CODEX_PROMPT.parse({ ...common, kind: 'mcp_url', url: params['url'] });
  if (['form', 'openai/form', 'openaiForm'].includes(mode))
    return CODEX_PROMPT.parse({ ...common, kind: 'mcp_form', schema: params['requestedSchema'] });
  return CODEX_PROMPT.parse({
    ...common,
    kind: 'unsupported',
    reason: `Codex MCP elicitation mode ${mode} is unavailable.`,
  });
}
