import { centralCallKey } from './central-call-key';
import { CentralToolFailures } from './central-failures';
import { toolMediaReferences } from './media-reference';
import * as trace from './central-trace';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import {
  HARNESS_CENTRAL_CATALOGUE,
  HARNESS_CENTRAL_CONTEXT,
  HARNESS_CENTRAL_RESULT,
  JSON_VALUE,
} from '@smarteverything/domain';
import type { HarnessHub } from './http';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';
import { bindCompactionPolicy } from '../composition/compaction-policy';

type CentralTool = z.infer<typeof HARNESS_CENTRAL_CATALOGUE>[number];
export class CentralHarnessTools {
  private readonly failures = new CentralToolFailures();
  private readonly registrations = new Map<
    string,
    { readonly signature: string; readonly dispose: () => void }
  >();
  private readonly contents = new Map<string, ContentBlock[]>();
  private readonly compactAt = new Map<string, number>();
  constructor(
    private readonly http: HarnessHub,
    private readonly persistence: Pick<HarnessControlPersistence, 'claim'>,
  ) {}
  async install(ctx: Context): Promise<void> {
    this.failures.install(ctx);
    bindCompactionPolicy(ctx, (id, signal) => this.compactionPercent(id, signal));
    const catalogue = await this.http.call({ operation: 'tools' }, HARNESS_CENTRAL_CATALOGUE);
    trace.catalogueLoaded(catalogue.length);
    this.update(ctx, catalogue);
    ctx.on('tools/result', (execution) => {
      this.contents.delete(centralCallKey(execution));
    });
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      if (context.agent === undefined) return next();
      const startedAt = performance.now();
      const current = await this.http.call(
        { operation: 'context', claim: this.persistence.claim(context.agent.id) },
        HARNESS_CENTRAL_CONTEXT,
        context.signal,
      );
      this.compactAt.set(context.agent.id, current.compact_at_percent);
      trace.contextFetched(context.agent.id, current, startedAt);
      this.update(ctx, current.tools);
      const result = await next();
      const allowed = new Set(current.declared_tool_names);
      result.tools = ctx.tools
        .schemas(context.agent)
        .filter((tool) => !this.registrations.has(tool.name) || allowed.has(tool.name));
      result.sections.push({
        name: 'smarteverything-conversation',
        text: current.system,
        interpolate: false,
      });
      result.contexts.push({
        name: 'smarteverything-conversation',
        text: current.turn,
        interpolate: false,
      });
      return result;
    });
    ctx.effect(() => (): void => {
      for (const entry of this.registrations.values()) entry.dispose();
      this.registrations.clear();
      this.contents.clear();
      this.compactAt.clear();
    });
  }
  private async compactionPercent(id: string, signal: AbortSignal): Promise<number> {
    const known = this.compactAt.get(id);
    if (known !== undefined) return known;
    const context = await this.http.call(
      { operation: 'context', claim: this.persistence.claim(id) },
      HARNESS_CENTRAL_CONTEXT,
      signal,
    );
    this.compactAt.set(id, context.compact_at_percent);
    return context.compact_at_percent;
  }
  private update(ctx: Context, tools: readonly CentralTool[]): void {
    for (const tool of tools) {
      if (tool.name === 'ask_user_question') continue;
      const signature = JSON.stringify(tool);
      const existing = this.registrations.get(tool.name);
      if (existing?.signature === signature) continue;
      trace.toolRegistered(tool.name, existing !== undefined);
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
      projectContent: (execution) => this.contents.get(centralCallKey(execution)),
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
        'operation_failed',
        'Central tools require a native conversation.',
      );
    const args = z.record(z.string(), JSON_VALUE).parse(raw);
    const startedAt = performance.now();
    trace.toolSent(agent.id, name, Object.keys(args).length);
    let result: z.infer<typeof HARNESS_CENTRAL_RESULT>;
    try {
      result = await this.http.call(
        { operation: 'tool', claim: this.persistence.claim(agent.id), name, arguments: args },
        HARNESS_CENTRAL_RESULT,
        execution.signal,
      );
    } catch (cause) {
      trace.toolFailed(agent.id, name, cause, { aborted: execution.signal.aborted, startedAt });
      throw cause;
    }
    trace.toolAnswered(agent.id, name, result, startedAt);
    const blocks: ContentBlock[] = [{ type: 'text', text: JSON.stringify(result.response) }];
    for (const picture of result.pictures)
      blocks.push(
        ...(await ctx.attachments.admitPromptContent([
          { type: 'image', mediaType: picture.mime, data: picture.data },
        ])),
      );
    this.contents.set(centralCallKey(execution), toolMediaReferences(blocks, result.response));
    this.failures.capture(execution, result.response);
    return result.response;
  }
}
