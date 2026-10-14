import { createHash, randomUUID } from 'node:crypto';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CODEX_AI_REPLY,
  CODEX_OPERATION,
  JSON_VALUE,
  type CodexAiExecute,
  type CodexAiRead,
  type CodexAiReply,
  type CodexAiSettings,
  DEFAULT_CODEX_AI_SETTINGS,
  type CodexPrompt,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { modelsOf } from './models';
import { launchCodex, type CodexProcessOptions } from './process';
import { CodexClient } from './client';
import { CodexPrompts } from './prompts';
import { PROMPT_SCOPE } from './prompt-schemas';
import { THREAD_REPLY, TURN_REPLY, type RpcRecord, type RpcId } from './protocol';
import { nativeRead } from './native-reads';
import {
  executionOptions,
  threadOptions,
  turnOptions,
  validateModel,
  requireExecutionLocation,
} from './options';
import { CodexRuntimeError } from './errors';
import { nativeMcpConfig, type CodexNativeGrantResolver } from './native-grant';
import { requireSubscriptionInference, requireThreadSubscriptionInference } from './account';
interface Receipt {
  readonly signature: string;
  readonly reply: Promise<CodexAiReply>;
}
export interface CodexNativeOptions extends CodexProcessOptions {
  readonly dataDirectory: string;
  readonly deviceId: string;
  readonly log: Logger;
  readonly nativeMcpGrant?: CodexNativeGrantResolver;
  readonly prompt: (prompt: CodexPrompt) => void;
  readonly changed: (reason: string | null) => void;
  readonly notification: (method: string, params: RpcRecord) => void;
}
export class CodexNative {
  private client: CodexClient | null = null;
  private prompts: CodexPrompts | null = null;
  private starting: Promise<CodexClient> | null = null;
  private enabled = false;
  private settings = DEFAULT_CODEX_AI_SETTINGS;
  private generation = randomUUID();
  private epoch = 0;
  private readonly receipts = new Map<string, Receipt>();
  constructor(private readonly options: CodexNativeOptions) {}
  configure(settings: CodexAiSettings): void {
    this.settings = settings;
    this.enabled = settings.control.enabled;
    if (!this.enabled) this.stop();
  }
  async connect(): Promise<void> {
    await this.ready();
  }
  async read(request: CodexAiRead): Promise<CodexAiReply> {
    if (request.operation === 'native_operation') {
      const receipt = this.receipts.get(request.operation_id);
      if (receipt === undefined)
        throw new CodexRuntimeError(
          'native_operation',
          'This operation receipt belongs to another Codex process lifetime.',
        );
      const reply = await receipt.reply;
      return {
        operation: 'native_operation',
        value: z.object({ native_operation: CODEX_OPERATION }).parse(reply.value).native_operation,
      };
    }
    const client = await this.ready();
    if (request.operation === 'prompts')
      return { operation: 'prompts', value: this.prompts?.list(request.session_id) ?? [] };
    return nativeRead(client, request);
  }
  async execute(request: CodexAiExecute): Promise<CodexAiReply> {
    if (!('operation_id' in request))
      throw new CodexRuntimeError(
        request.operation,
        'Codex native mutations require a receipt ID.',
      );
    const signature = createHash('sha256').update(canonicalRuntimeInput(request)).digest('hex');
    const known = this.receipts.get(request.operation_id);
    if (known !== undefined) {
      if (known.signature !== signature)
        throw new CodexRuntimeError(
          request.operation,
          'This Codex operation ID was used with different input.',
        );
      return known.reply;
    }
    if (this.receipts.size >= 10_000)
      throw new CodexRuntimeError(
        request.operation,
        'Codex native operation receipt capacity reached.',
      );
    const reply = this.mutate(request);
    this.receipts.set(request.operation_id, { signature, reply });
    return reply;
  }
  stop(): void {
    this.epoch++;
    this.prompts?.expire();
    this.client?.stop();
    this.client = null;
    this.prompts = null;
    if (this.options.nativeMcpGrant !== undefined)
      void this.options.nativeMcpGrant.revoke().catch((cause: unknown): void => {
        this.options.log.error('mcp.revoke_failed', cause);
      });
  }
  async models(): Promise<Awaited<ReturnType<typeof modelsOf>>> {
    return modelsOf(await this.ready(), this.options.deviceId);
  }
  private requireEpoch(epoch: number): void {
    if (!this.enabled || epoch !== this.epoch)
      throw new CodexRuntimeError('control', 'Codex control was disabled while initializing.');
  }
  private async ready(): Promise<CodexClient> {
    if (!this.enabled)
      throw new CodexRuntimeError('control', 'Codex session control is disabled on this computer.');
    if (this.starting !== null) return this.starting;
    if (this.client !== null) return this.client;
    this.starting ??= this.initialize();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }
  private async initialize(): Promise<CodexClient> {
    const epoch = this.epoch;
    const client = new CodexClient({
      process: await launchCodex(this.options, 'control'),
      received: (method, params, id): void => {
        this.receive(method, params, id);
      },
      closed: (cause): void => {
        if (this.client === client) {
          this.prompts?.expire();
          this.client = null;
          this.prompts = null;
        }
        this.options.changed(cause.message.slice(0, 2000));
      },
    });
    this.client = client;
    try {
      this.requireEpoch(epoch);
      await client.initialize();
      this.requireEpoch(epoch);
      this.generation = randomUUID();
      this.client = client;
      this.prompts = new CodexPrompts(client, this.options.prompt);
      this.options.changed(null);
      return client;
    } catch (cause) {
      client.stop();
      throw cause;
    }
  }
  private receive(method: string, params: RpcRecord, id: RpcId | null): void {
    if (id !== null) {
      if (!PROMPT_SCOPE.safeParse(params).success) {
        this.client?.reject(id, 'This owner request has no supported thread scope.');
        return;
      }
      if (this.prompts === null)
        this.client?.reject(id, 'The owner control connection is not initialized.');
      else this.prompts.receive(method, { ...params, control_generation: this.generation }, id);
      return;
    }
    if (method === 'serverRequest/resolved') this.prompts?.resolved(params);
    if (params['threadId'] !== undefined)
      this.options.notification(method, { ...params, control_generation: this.generation });
  }
  private async mutate(
    request: CodexAiExecute & { readonly operation_id: string },
  ): Promise<CodexAiReply> {
    const operation = {
      id: request.operation_id,
      operation: request.operation,
      state: 'pending',
      value: null,
      error: null,
    };
    try {
      const client = await this.ready();
      const generation = this.generation;
      const value = JSON_VALUE.parse({
        result: await this.nativeMutation(client, request),
        control_generation: generation,
      });
      return CODEX_AI_REPLY.parse({
        operation: request.operation,
        value: { native_operation: { ...operation, state: 'completed', value } },
      });
    } catch (cause) {
      const uncertain = uncertainMutation(cause);
      return CODEX_AI_REPLY.parse({
        operation: request.operation,
        value: {
          native_operation: {
            ...operation,
            state: uncertain ? 'uncertain' : 'failed',
            error:
              cause instanceof Error ? cause.message.slice(0, 2000) : 'The Codex operation failed.',
          },
        },
      });
    }
  }
  private async startNative(
    client: CodexClient,
    request: Extract<CodexAiExecute, { operation: 'start' }>,
  ): Promise<unknown> {
    const location = await executionOptions(
      request.start.options,
      join(this.options.dataDirectory, 'codex', 'workspaces', request.operation_id),
    );
    validateModel(
      {
        ...request.start,
        messages: [{ role: 'user', content: [{ type: 'text', text: request.start.text }] }],
      },
      await this.models(),
    );
    await requireSubscriptionInference(client, location.cwd);
    const started = THREAD_REPLY.parse(
      await client.request('thread/start', {
        model: request.start.model,
        ...(await nativeMcpConfig(this.options.nativeMcpGrant, this.settings)),
        ...threadOptions(request.start.options, location.cwd, location.roots),
      }),
    );
    requireExecutionLocation(started, location);
    await requireSubscriptionInference(client, location.cwd);
    const turn = TURN_REPLY.parse(
      await client.request('turn/start', {
        threadId: started.thread.id,
        input: textInput(request.start.text),
        effort: request.start.effort,
        ...turnOptions(request.start.options),
      }),
    );
    return { session_id: started.thread.id, turn_id: turn.turn.id, acknowledged: true };
  }
  private async rename(
    client: CodexClient,
    request: Extract<CodexAiExecute, { operation: 'rename' }>,
  ): Promise<unknown> {
    await client.request('thread/name/set', { threadId: request.session_id, name: request.title });
    return { acknowledged: true };
  }
  private answer(request: Extract<CodexAiExecute, { operation: 'answer' }>): {
    readonly answered: true;
  } {
    if (this.prompts === null)
      throw new CodexRuntimeError('answer', 'The owning prompt connection is unavailable.');
    this.prompts.answer(request.prompt_id, request.answer);
    return { answered: true };
  }
  private async send(
    client: CodexClient,
    request: Extract<CodexAiExecute, { operation: 'send' }>,
  ): Promise<unknown> {
    const thread = THREAD_REPLY.parse(
      await client.request('thread/read', { threadId: request.session_id, includeTurns: false }),
    ).thread;
    if (thread.status.type !== 'idle' || thread.canAcceptDirectInput === false)
      throw new CodexRuntimeError(
        'send',
        'Resume an unloaded thread explicitly; use steer with the expected turn ID for running work.',
      );
    await requireThreadSubscriptionInference(client, request.session_id);
    return {
      turn_id: TURN_REPLY.parse(
        await client.request('turn/start', {
          threadId: request.session_id,
          input: textInput(request.text),
        }),
      ).turn.id,
    };
  }
  private async nativeMutation(client: CodexClient, request: CodexAiExecute): Promise<unknown> {
    if (request.operation === 'answer') return this.answer(request);
    if (request.operation === 'start') return this.startNative(client, request);
    if (!('session_id' in request))
      throw new CodexRuntimeError(
        request.operation,
        'The Codex native action requires an exact session.',
      );
    const bound = { threadId: request.session_id };
    if (request.operation === 'resume')
      return {
        session_id: THREAD_REPLY.parse(
          await client.request('thread/resume', {
            ...bound,
            ...(await nativeMcpConfig(this.options.nativeMcpGrant, this.settings)),
          }),
        ).thread.id,
      };
    if (request.operation === 'send') return this.send(client, request);
    if (request.operation === 'steer') {
      await requireThreadSubscriptionInference(client, request.session_id);
      return z.object({ turnId: z.string() }).parse(
        await client.request('turn/steer', {
          ...bound,
          expectedTurnId: request.expected_turn_id,
          input: textInput(request.text),
        }),
      );
    }
    if (request.operation === 'interrupt') {
      await client.request('turn/interrupt', { ...bound, turnId: request.turn_id });
      return { acknowledged: true, state: 'stopping' };
    }
    if (request.operation === 'rename') return this.rename(client, request);
    if (request.operation === 'fork')
      return {
        session_id: THREAD_REPLY.parse(await client.request('thread/fork', bound)).thread.id,
      };
    const methods = {
      archive: 'thread/archive',
      unarchive: 'thread/unarchive',
      delete: 'thread/delete',
    } as const;
    await client.request(methods[request.operation], bound);
    return { acknowledged: true };
  }
}
function textInput(text: string): RpcRecord[] {
  return [{ type: 'text', text, text_elements: [] }];
}

function uncertainMutation(cause: unknown): boolean {
  return (
    cause instanceof CodexRuntimeError &&
    cause.uncertain &&
    [
      'thread/start',
      'thread/resume',
      'turn/start',
      'turn/steer',
      'turn/interrupt',
      'thread/name/set',
      'thread/fork',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
      'write',
    ].includes(cause.operation)
  );
}
