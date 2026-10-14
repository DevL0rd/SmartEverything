import { CentralToolFailures } from './central-failures';
import { toolMediaReferences } from './media-reference';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import {
  HARNESS_CENTRAL_CATALOGUE,
  HARNESS_CENTRAL_CONTEXT,
  HARNESS_CENTRAL_RESULT,
  JSON_VALUE,
} from '@smarteverything/domain';
import type { HarnessHttp } from './http';
import type { HttpHarnessPersistence } from './persistence';
import { HarnessRuntimeError } from '../host/errors';
import { bindCompactionPolicy } from '../composition/compaction-policy';

type CentralTool = z.infer<typeof HARNESS_CENTRAL_CATALOGUE>[number];
const CALL = z.object({ callId: z.string(), name: z.string(), arguments: z.string() });
export class CentralHarnessTools {
  private readonly failures = new CentralToolFailures();
  private readonly registrations = new Map<
    string,
    { readonly signature: string; readonly dispose: () => void }
  >();
  private readonly calls = new Map<
    string,
    { readonly seq: number; readonly name: string; readonly arguments: string }
  >();
  private readonly contents = new Map<ToolCallId, ContentBlock[]>();
  constructor(
    private readonly http: HarnessHttp,
    private readonly persistence: HttpHarnessPersistence,
  ) {}
  async install(ctx: Context): Promise<void> {
    this.failures.install(ctx);
    bindCompactionPolicy(ctx, (id, signal) => this.compactionPercent(id, signal));
    this.update(ctx, await this.http.call({ operation: 'tools' }, HARNESS_CENTRAL_CATALOGUE));
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'tool/call') return;
      const call = CALL.parse(event.data);
      this.calls.set(`${session.id}:${call.callId}`, {
        seq: event.seq,
        name: call.name,
        arguments: call.arguments,
      });
    });
    ctx.on('tools/result', (execution) => {
      this.contents.delete(execution.callId);
      if (execution.agent !== undefined)
        this.calls.delete(`${execution.agent.id}:${execution.callId}`);
    });
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      if (context.agent === undefined) return next();
      const current = await this.http.call(
        { operation: 'context', claim: this.persistence.claim(context.agent.id) },
        HARNESS_CENTRAL_CONTEXT,
        context.signal,
      );
      this.update(ctx, current.tools);
      const result = await next();
      const allowed = new Set(current.tools.map((tool) => tool.name));
      result.tools = ctx.tools
        .schemas(context.agent)
        .filter((tool) => !this.registrations.has(tool.name) || allowed.has(tool.name));
      result.contexts.push({
        name: 'smarteverything-conversation',
        text: current.text,
        interpolate: false,
      });
      return result;
    });
    ctx.effect(() => (): void => {
      for (const entry of this.registrations.values()) entry.dispose();
      this.registrations.clear();
      this.calls.clear();
      this.contents.clear();
    });
  }
  private async compactionPercent(id: string, signal: AbortSignal): Promise<number> {
    const context = await this.http.call(
      { operation: 'context', claim: this.persistence.claim(id) },
      HARNESS_CENTRAL_CONTEXT,
      signal,
    );
    if (context.compact_at_percent === undefined)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'The home hub must be upgraded to provide the configured compaction policy.',
      );
    return context.compact_at_percent;
  }
  private update(ctx: Context, tools: readonly CentralTool[]): void {
    for (const tool of tools) {
      if (tool.name === 'ask_user_question') continue;
      const signature = JSON.stringify(tool);
      const existing = this.registrations.get(tool.name);
      if (existing?.signature === signature) continue;
      existing?.dispose();
      if (ctx.tools.get(tool.name) !== undefined)
        throw new HarnessRuntimeError(
          'composition_incompatible',
          `Central tool ${tool.name} collides with a native tool.`,
        );
      this.registrations.set(tool.name, {
        signature,
        dispose: ctx.tools.register(this.definition(ctx, tool)),
      });
    }
  }
  private definition(ctx: Context, tool: CentralTool): Parameters<Context['tools']['register']>[0] {
    const parameters = tool.parameters;
    assertObjectJsonSchema(parameters);
    return {
      ...tool,
      parameters,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: (raw, execution) => this.execute(ctx, tool.name, raw, execution),
      projectContent: (execution) => this.contents.get(execution.callId),
    };
  }
  private async execute(
    ctx: Context,
    name: string,
    raw: unknown,
    execution: ToolRunContext,
  ): Promise<unknown> {
    const agent = execution.agent;
    if (agent === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central tools require an owned native conversation.',
      );
    const call = this.calls.get(`${agent.id}:${execution.callId}`);
    const args = z.record(z.string(), JSON_VALUE).parse(raw);
    if (call?.name !== name || JSON.stringify(JSON.parse(call.arguments)) !== JSON.stringify(args))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central tool call has no exact native event lineage.',
      );
    await ctx.sessions.flush(agent.session);
    const result = await this.http.call(
      {
        operation: 'tool',
        claim: this.persistence.claim(agent.id),
        call_id: execution.callId,
        call_seq: call.seq,
        name,
        arguments: args,
      },
      HARNESS_CENTRAL_RESULT,
      execution.signal,
    );
    const blocks: ContentBlock[] = [{ type: 'text', text: JSON.stringify(result.response) }];
    for (const picture of result.pictures)
      blocks.push(
        ...(await ctx.attachments.admitPromptContent([
          { type: 'image', mediaType: picture.mime, data: picture.data },
        ])),
      );
    this.contents.set(execution.callId, toolMediaReferences(blocks, result.response));
    this.failures.capture(execution, result.response);
    return result.response;
  }
}
