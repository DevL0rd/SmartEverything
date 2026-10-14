import { z } from 'zod';
import {
  CODEX_PROVIDER_EVENT,
  JSON_VALUE,
  type CodexProviderTurn,
  type CodexProviderEvent,
  type CodexProviderOptions,
  type CODEX_USAGE,
} from '@smarteverything/domain';
import { TURN, type RpcRecord, type RpcId } from './protocol';
import { CodexAgents } from './agents';
import { CodexPrompts } from './prompts';
import type { CodexClient } from './client';
import { CodexRuntimeError } from './errors';
const SCOPE = z.object({
  threadId: z.string(),
  turnId: z.string().nullable().optional(),
  itemId: z.string().optional(),
});
const ITEM = z.looseObject({ id: z.string(), type: z.string() });
const DYNAMIC = z.object({
  threadId: z.string(),
  turnId: z.string(),
  callId: z.string(),
  namespace: z.string().nullable(),
  tool: z.string(),
  arguments: z.record(z.string(), z.json()),
});
const BREAKDOWN = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  totalTokens: z.int().nonnegative(),
});
export class CodexJob {
  readonly generation: string;
  readonly prompts: CodexPrompts;
  readonly agents: CodexAgents;
  private seq = 0;
  private readonly command: boolean;
  turnId: string | null = null;
  active = true;
  options: CodexProviderOptions;
  model: string;
  effort: string | null;
  usage: z.infer<typeof CODEX_USAGE> = {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    rate_limits: null,
  };
  private readonly tools = new Map<string, RpcId>();
  readonly turn: CodexProviderTurn;
  readonly client: CodexClient;
  readonly threadId: string;
  readonly cwd: string;
  readonly roots: readonly string[];
  private readonly publish: (event: CodexProviderEvent) => void;
  private readonly cleanup: () => void;
  constructor(options: {
    readonly turn: CodexProviderTurn;
    readonly client: CodexClient;
    readonly threadId: string;
    readonly cwd: string;
    readonly roots: readonly string[];
    readonly publish: (event: CodexProviderEvent) => void;
    readonly now: () => string;
    readonly generation: string;
    readonly cleanup: () => void;
    readonly command?: boolean;
  }) {
    this.turn = options.turn;
    this.command = options.command === true;
    this.client = options.client;
    this.threadId = options.threadId;
    this.cwd = options.cwd;
    this.roots = options.roots;
    this.publish = options.publish;
    this.generation = options.generation;
    this.cleanup = options.cleanup;
    this.options = options.turn.options;
    this.model = options.turn.model;
    this.effort = options.turn.effort;
    this.prompts = new CodexPrompts(options.client, (prompt): void => {
      this.emit({ kind: 'prompt', prompt });
      if (prompt.status === 'pending')
        this.lifecycle(
          prompt.kind === 'user_input' || prompt.kind.startsWith('mcp_')
            ? 'waiting_answer'
            : 'waiting_approval',
        );
      else if (this.active) this.lifecycle('working');
    });
    this.agents = new CodexAgents({
      ...options,
      root: options.threadId,
      publish: (run): void => {
        this.emit({ kind: 'agent', run: JSON_VALUE.parse(run) });
      },
    });
  }
  accepted(): void {
    this.emit({ kind: 'accepted', session_id: this.threadId });
    this.emit({
      kind: 'context',
      context: {
        device_id: this.turn.device_id,
        runtime: 'codex',
        session_id: this.threadId,
        process_generation: this.generation,
        cwd: this.cwd,
        workspace_roots: [this.cwd, ...this.roots],
      },
    });
    this.emit({ kind: 'usage', usage: this.usage });
    this.lifecycle('working');
  }
  emit(payload: RpcRecord): void {
    this.publish(
      CODEX_PROVIDER_EVENT.parse({
        job_id: this.turn.job_id,
        chat_id: this.turn.chat_id,
        seq: ++this.seq,
        process_generation: this.generation,
        thread_id: this.threadId,
        turn_id: this.turnId,
        item_id: null,
        ...payload,
      }),
    );
  }
  lifecycle(state: string, reason: string | null = null): void {
    this.emit({ kind: 'lifecycle', state, reason });
  }
  receive(method: string, params: RpcRecord, id: RpcId | null): void {
    const scope = SCOPE.safeParse(params);
    if (!scope.success) return;
    if (scope.data.threadId !== this.threadId) {
      this.child(method, params, id, scope.data.threadId);
      return;
    }
    if (id !== null) {
      if (this.stale(scope.data.turnId) || (this.command && this.turnId === null)) {
        this.client.reject(id, 'This request belongs to a stale Codex turn.');
        return;
      }
      this.observeTurn(scope.data.turnId);
      this.request(method, params, id);
      return;
    }
    this.receiveNotification(method, params, scope.data.turnId);
  }
  private receiveNotification(
    method: string,
    params: RpcRecord,
    turnId: string | null | undefined,
  ): void {
    if (method === 'serverRequest/resolved') {
      const prompt = this.prompts.resolved(params);
      if (prompt !== null) this.emit({ kind: 'prompt_resolved', prompt_id: prompt });
      return;
    }
    if (!this.active && method !== 'thread/tokenUsage/updated') return;
    if (method === 'turn/started') {
      const observed = TURN.parse(params['turn']).id;
      if (!this.stale(observed)) this.started(observed);
      return;
    }
    if (this.stale(turnId)) return;
    if (!this.acceptsNotification(method, turnId)) return;
    this.notification(method, params);
  }
  private acceptsNotification(method: string, turnId: string | null | undefined): boolean {
    if (!this.command) return true;
    if (this.turnId === null) return false;
    if (['item/started', 'item/completed'].includes(method)) return turnId === this.turnId;
    return true;
  }
  started(id: string): void {
    if (this.turnId !== null && this.turnId !== id)
      throw new CodexRuntimeError(
        'turn',
        'Codex acknowledged a different turn from the observed turn.',
        true,
      );
    this.turnId = id;
    if (this.active) this.lifecycle('working');
  }
  private observeTurn(id: string | null | undefined): void {
    if (this.turnId === null && typeof id === 'string') this.turnId = id;
  }
  private stale(turnId: string | null | undefined): boolean {
    return typeof turnId === 'string' && this.turnId !== null && turnId !== this.turnId;
  }
  private child(method: string, params: RpcRecord, id: RpcId | null, threadId: string): void {
    if (this.agents.owns(threadId)) {
      if (method === 'item/agentMessage/delta') this.agents.text(threadId, params);
      if ((method === 'item/started' || method === 'item/completed') && this.turnId !== null)
        this.agents.item(params['item'], this.turnId);
    }
    if (id !== null)
      this.client.reject(id, 'Child requests cannot use the parent home-tool bridge.');
  }
  toolResult(callId: string, text: string, failed: boolean): void {
    const id = this.tools.get(callId);
    if (id === undefined)
      throw new CodexRuntimeError(
        'tool_result',
        'The Codex tool request expired or belongs to another job.',
      );
    this.client.respond(id, { contentItems: [{ type: 'inputText', text }], success: !failed });
    this.tools.delete(callId);
    this.emit({ kind: 'tool_result', call_id: callId, text, failed, origin: 'hub' });
  }
  lost(reason: string): void {
    this.agents.lost(reason);
    if (!this.active) return;
    this.cleanup();
    this.active = false;
    this.prompts.expire();
    this.tools.clear();
    this.lifecycle('unknown', reason);
    this.emit({ kind: 'failed', code: 'transport_lost', message: reason.slice(0, 2000) });
  }
  rejected(reason: string): void {
    if (!this.active) return;
    this.cleanup();
    this.active = false;
    this.prompts.expire();
    this.tools.clear();
    this.lifecycle('failed', reason);
    this.emit({ kind: 'failed', code: 'command_failed', message: reason.slice(0, 2000) });
  }
  private request(method: string, params: RpcRecord, id: RpcId): void {
    if (!this.active) {
      this.client.reject(id, 'This Codex job is no longer accepting requests.');
      return;
    }
    if (method !== 'item/tool/call') {
      this.prompts.receive(method, params, id);
      return;
    }
    const call = DYNAMIC.parse(params);
    if (
      call.namespace !== null ||
      !this.turn.tools.some((tool) => tool.name === call.tool) ||
      this.tools.has(call.callId) ||
      this.tools.size >= 1000
    ) {
      this.client.reject(id, 'The Codex tool is outside this job grant or repeats a pending call.');
      return;
    }
    this.tools.set(call.callId, id);
    this.emit({
      kind: 'tool_call',
      call_id: call.callId,
      name: call.tool,
      input: call.arguments,
      origin: 'hub',
    });
  }
  private notification(method: string, params: RpcRecord): void {
    if (method === 'item/agentMessage/delta') {
      this.text(params);
      return;
    }
    if (method === 'item/reasoning/summaryTextDelta') {
      this.emit({ kind: 'thinking', delta: z.string().max(64_000).parse(params['delta']) });
      return;
    }
    if (method === 'turn/completed') {
      this.completed(params);
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      this.tokenUsage(params);
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      this.item(params, method === 'item/completed' ? 'completed' : 'started');
      return;
    }
    if (method === 'error') {
      const error = z
        .object({ error: z.object({ message: z.string() }), willRetry: z.boolean() })
        .parse(params);
      this.emit({
        kind: 'work_item',
        type: 'error',
        payload: { message: error.error.message, will_retry: error.willRetry },
      });
      return;
    }
    if (
      [
        'turn/diff/updated',
        'turn/plan/updated',
        'item/commandExecution/outputDelta',
        'item/fileChange/outputDelta',
        'item/fileChange/patchUpdated',
        'item/mcpToolCall/progress',
      ].includes(method)
    )
      this.emit({ kind: 'work_item', type: method, payload: params });
  }
  private text(params: RpcRecord): void {
    this.emit({
      kind: 'text',
      delta: z.string().max(64_000).parse(params['delta']),
      item_id: z.string().max(200).nullable().optional().parse(params['itemId']) ?? null,
    });
  }
  private tokenUsage(params: RpcRecord): void {
    const total = z.object({ total: BREAKDOWN }).parse(params['tokenUsage']).total;
    this.usage = {
      ...this.usage,
      input_tokens: total.inputTokens,
      output_tokens: total.outputTokens,
      total_tokens: total.totalTokens,
    };
    this.emit({ kind: 'usage', usage: this.usage });
  }
  private item(params: RpcRecord, phase: 'started' | 'completed'): void {
    const item = ITEM.parse(params['item']);
    if (this.turnId !== null) this.agents.item(params['item'], this.turnId);
    const known = [
      'agentMessage',
      'userMessage',
      'reasoning',
      'commandExecution',
      'fileChange',
      'mcpToolCall',
      'dynamicToolCall',
      'plan',
      'collabAgentToolCall',
      'subAgentActivity',
      'webSearch',
      'imageView',
      'imageGeneration',
      'contextCompaction',
    ];
    if (known.includes(item.type))
      this.emit({
        kind: 'work_item',
        type: item.type,
        payload: { ...z.record(z.string(), z.json()).parse(item), _phase: phase },
        item_id: item.id,
      });
    else {
      const summary = JSON.stringify(item);
      this.emit({
        kind: 'unsupported_item',
        type: item.type,
        summary: summary.slice(0, 16_000),
        truncated: summary.length > 16_000,
        item_id: item.id,
      });
    }
  }
  private completed(params: RpcRecord): void {
    const turn = TURN.parse(params['turn']);
    if (this.turnId !== null && turn.id !== this.turnId) return;
    this.turnId = turn.id;
    this.cleanup();
    this.active = false;
    this.prompts.expire();
    this.tools.clear();
    if (turn.status === 'completed' || turn.status === 'interrupted') {
      this.lifecycle(turn.status);
      this.emit({
        kind: 'completed',
        session_id: this.threadId,
        interrupted: turn.status === 'interrupted',
      });
      return;
    }
    if (turn.status === 'failed') {
      this.lifecycle('failed', turn.error?.message ?? 'Codex turn failed.');
      this.emit({
        kind: 'failed',
        code: 'turn_failed',
        message: turn.error?.message ?? 'Codex turn failed.',
      });
    } else {
      this.lifecycle('unknown', 'Codex sent a nonterminal turn completion notice.');
      this.emit({
        kind: 'failed',
        code: 'transport_lost',
        message: 'Codex sent a nonterminal turn completion notice.',
      });
    }
  }
}
