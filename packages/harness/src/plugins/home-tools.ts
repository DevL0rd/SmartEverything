import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ObjectJsonSchema, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { centralCallKey } from '../process/central-call-key';
import { CentralToolFailures } from '../process/central-failures';
import { toolRegistered } from '../process/central-trace';
import { toolMediaReferences } from '../process/media-reference';

declare module '@deepseek-ai/cordis' {
  interface Context {
    homeTools: HomeTools;
  }
}

export const name = 'home-tools';

export type HomeToolArguments = Readonly<Record<string, unknown>>;

export interface HomeTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ObjectJsonSchema;
  readonly concurrencySafe: (args: HomeToolArguments) => boolean;
}

export interface HomeToolPicture {
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  readonly data: string;
}

export interface HomeToolResult {
  readonly response: Readonly<Record<string, JsonValue>>;
  readonly pictures: readonly HomeToolPicture[];
}

export interface HomeToolSession {
  readonly tools: readonly HomeTool[];
  readonly declared: readonly string[];
  readonly eventId?: string | null;
  readonly prompt?: { readonly system: string; readonly turn: string };
}

export interface HomeToolCall {
  readonly sessionId: string;
  readonly eventId?: string | null;
  readonly callId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly signal: AbortSignal;
}

export interface HomeToolTransport {
  readonly tools: () => readonly HomeTool[];
  readonly changes: (listener: () => void) => () => void;
  readonly session: (sessionId: string, signal?: AbortSignal) => Promise<HomeToolSession>;
  readonly call: (call: HomeToolCall) => Promise<HomeToolResult>;
}

interface Registration {
  readonly signature: string;
  readonly dispose: () => void;
}

class Binding {
  readonly registrations = new Map<string, Registration>();
  readonly executions = new Map<ToolExecution['token'], string | null>();
  private readonly turns = new WeakMap<AbortSignal, string | null>();
  private settled: readonly HomeTool[] | undefined;

  constructor(readonly transport: HomeToolTransport) {}

  isSettled(tools: readonly HomeTool[]): boolean {
    return this.settled === tools;
  }

  settle(tools: readonly HomeTool[]): void {
    this.settled = tools;
  }

  bindTurn(signal: AbortSignal | undefined, eventId: string | null | undefined): void {
    if (signal === undefined || eventId === undefined) return;
    const previous = this.turns.get(signal);
    if (previous !== undefined && previous !== eventId)
      throw new HarnessRuntimeError('operation_failed', 'The initiating home tool turn changed.');
    this.turns.set(signal, eventId);
  }

  bindExecution(execution: ToolExecution): void {
    const eventId =
      execution.parent === undefined
        ? this.turns.get(execution.signal)
        : this.executions.get(execution.parent);
    if (eventId !== undefined) this.executions.set(execution.token, eventId);
  }
}

type ToolDefinition = Parameters<Context['tools']['register']>[0];

const ARGUMENTS = z.record(z.string(), JSON_VALUE);

function signatureOf(tool: HomeTool): string {
  return JSON.stringify([tool.name, tool.description, tool.parameters]);
}

export class HomeTools extends Service {
  private binding: Binding | undefined;
  private scope: Context | undefined;
  private readonly contents = new Map<string, ContentBlock[]>();
  private readonly failures = new CentralToolFailures();

  constructor(ctx: Context) {
    super(ctx, 'homeTools');
  }

  install(ctx: Context): void {
    this.scope = ctx;
    ctx.effect(() => (): void => {
      this.scope = undefined;
    });
    this.failures.install(ctx);
    ctx.on('tools/pre-execute', (execution, next) => {
      this.binding?.bindExecution(execution);
      return next();
    });
    ctx.on('tools/result', (execution) => {
      this.binding?.executions.delete(execution.token);
      this.contents.delete(centralCallKey(execution));
    });
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      const binding = this.binding;
      if (binding === undefined || context.agent === undefined) return next();
      const session = await binding.transport.session(context.agent.id, context.signal);
      binding.bindTurn(context.signal, session.eventId);
      this.reconcile(binding, session.tools);
      const result = await next();
      const declared = new Set(session.declared);
      result.tools = result.tools.filter(
        (tool) => !binding.registrations.has(tool.name) || declared.has(tool.name),
      );
      if (session.prompt === undefined) return result;
      result.sections.push({
        name: 'smarteverything-conversation',
        text: session.prompt.system,
        interpolate: false,
      });
      result.contexts.push({
        name: 'smarteverything-conversation',
        text: session.prompt.turn,
        interpolate: false,
      });
      return result;
    });
  }

  bind(transport: HomeToolTransport): () => void {
    this.release();
    const binding = new Binding(transport);
    this.binding = binding;
    this.reconcile(binding, transport.tools());
    const stop = transport.changes(() => {
      this.reconcile(binding, transport.tools());
    });
    return (): void => {
      stop();
      if (this.binding === binding) this.release();
    };
  }

  private get registry(): Context {
    if (this.scope === undefined)
      throw new HarnessRuntimeError('runtime_unavailable', 'Home tools are not ready.');
    return this.scope;
  }

  private release(): void {
    for (const entry of this.binding?.registrations.values() ?? []) entry.dispose();
    this.binding?.registrations.clear();
    this.binding = undefined;
    this.contents.clear();
  }

  private reconcile(binding: Binding, tools: readonly HomeTool[]): void {
    if (binding.isSettled(tools)) return;
    const current = new Set(tools.map((tool) => tool.name));
    for (const [toolName, entry] of binding.registrations) {
      if (current.has(toolName)) continue;
      entry.dispose();
      binding.registrations.delete(toolName);
    }
    for (const tool of tools) this.register(binding, tool);
    binding.settle(tools);
  }

  private register(binding: Binding, tool: HomeTool): void {
    const signature = signatureOf(tool);
    const existing = binding.registrations.get(tool.name);
    if (existing?.signature === signature) return;
    toolRegistered(tool.name, existing !== undefined);
    existing?.dispose();
    binding.registrations.delete(tool.name);
    if (this.registry.tools.get(tool.name) !== undefined)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Home tool ${tool.name} collides with a native tool.`,
      );
    binding.registrations.set(tool.name, {
      signature,
      dispose: this.registry.tools.register(this.definition(binding, tool)),
    });
  }

  private definition(binding: Binding, tool: HomeTool): ToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      parameters: { ...tool.parameters },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      isConcurrencySafe: (args) => tool.concurrencySafe(ARGUMENTS.safeParse(args).data ?? {}),
      execute: (raw, execution) => this.execute(binding, tool.name, raw, execution),
      projectContent: (execution) => this.contents.get(centralCallKey(execution)),
    };
  }

  private async execute(
    binding: Binding,
    toolName: string,
    raw: unknown,
    execution: ToolRunContext,
  ): Promise<unknown> {
    const agent = execution.agent;
    if (agent === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Home tools require a native conversation.',
      );
    const eventId = binding.executions.get(execution.token);
    const result = await binding.transport.call({
      sessionId: agent.id,
      ...(eventId === undefined ? {} : { eventId }),
      callId: execution.callId,
      name: toolName,
      arguments: ARGUMENTS.parse(raw),
      signal: execution.signal,
    });
    const blocks: ContentBlock[] = [{ type: 'text', text: JSON.stringify(result.response) }];
    for (const picture of result.pictures)
      blocks.push(
        ...(await this.registry.attachments.admitPromptContent([
          { type: 'image', mediaType: picture.mediaType, data: picture.data },
        ])),
      );
    this.contents.set(centralCallKey(execution), toolMediaReferences(blocks, result.response));
    this.failures.capture(execution, { ...result.response });
    return result.response;
  }
}

export function bindHomeTools(ctx: Context, transport: HomeToolTransport): () => void {
  const service = ctx.get('homeTools');
  if (!(service instanceof HomeTools))
    throw new HarnessRuntimeError('runtime_unavailable', 'Home tools are unavailable.');
  return service.bind(transport);
}

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(HomeTools);
  await ctx.inject(
    ['tools', 'systemPrompt', 'attachments', 'homeTools'],
    (active: Context): void => {
      active.homeTools.install(active);
    },
  );
}
