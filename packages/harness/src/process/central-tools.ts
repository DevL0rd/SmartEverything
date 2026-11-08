import * as trace from './central-trace';
import type { Context } from '@deepseek-ai/cordis';
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import {
  HARNESS_CENTRAL_CATALOGUE,
  HARNESS_CENTRAL_CONTEXT,
  HARNESS_CENTRAL_RESULT,
} from '@smarteverything/domain';
import type { HarnessHub } from './http';
import type { HarnessControlPersistence } from './contracts';
import { bindCompactionPolicy } from '../composition/compaction-policy';
import { bindHomeTools } from '../plugins/home-tools';
import { HarnessRuntimeError } from '../host/errors';
import type {
  HomeTool,
  HomeToolCall,
  HomeToolResult,
  HomeToolSession,
  HomeToolTransport,
} from '../plugins/home-tools';

type CentralTool = z.infer<typeof HARNESS_CENTRAL_CATALOGUE>[number];

const FORWARDED = z.looseObject({ name: z.string().trim() });

function concurrencySafe(tool: CentralTool): HomeTool['concurrencySafe'] {
  const targets = tool.read_only_targets;
  if (targets === undefined) return () => tool.read_only;
  const readOnly = new Set(targets);
  return (args) => {
    const forwarded = FORWARDED.safeParse(args);
    return forwarded.success && readOnly.has(forwarded.data.name);
  };
}

function homeTool(tool: CentralTool): HomeTool {
  const parameters = tool.parameters;
  assertObjectJsonSchema(parameters);
  return {
    name: tool.name,
    description: tool.description,
    parameters,
    concurrencySafe: concurrencySafe(tool),
  };
}

export class CentralHarnessTools implements HomeToolTransport {
  private catalogue: readonly HomeTool[] = [];
  private readonly compactAt = new Map<string, number>();

  constructor(
    private readonly http: HarnessHub,
    private readonly persistence: Pick<HarnessControlPersistence, 'claim'>,
  ) {}

  async install(ctx: Context): Promise<void> {
    bindCompactionPolicy(ctx, (id, signal) => this.compactionPercent(id, signal));
    const catalogue = await this.http.call({ operation: 'tools' }, HARNESS_CENTRAL_CATALOGUE);
    trace.catalogueLoaded(catalogue.length);
    this.catalogue = catalogue.map(homeTool);
    ctx.effect(() => bindHomeTools(ctx, this));
    ctx.effect(() => (): void => {
      this.compactAt.clear();
    });
  }

  tools(): readonly HomeTool[] {
    return this.catalogue;
  }

  changes(): () => void {
    return (): void => undefined;
  }

  async session(sessionId: string, signal?: AbortSignal): Promise<HomeToolSession> {
    const startedAt = performance.now();
    const current = await this.context(sessionId, signal);
    this.compactAt.set(sessionId, current.compact_at_percent);
    trace.contextFetched(sessionId, current, startedAt);
    this.catalogue = current.tools.map(homeTool);
    return {
      tools: this.catalogue,
      declared: current.declared_tool_names,
      eventId: current.event_id,
      prompt: { system: current.system, turn: current.turn },
    };
  }

  async call(request: HomeToolCall): Promise<HomeToolResult> {
    const { sessionId, eventId, name, signal } = request;
    if (eventId === undefined)
      throw new HarnessRuntimeError('operation_failed', 'The home tool has no authenticated turn.');
    const startedAt = performance.now();
    trace.toolSent(sessionId, name, Object.keys(request.arguments).length);
    let result: z.infer<typeof HARNESS_CENTRAL_RESULT>;
    try {
      result = await this.http.call(
        {
          operation: 'tool',
          claim: this.persistence.claim(sessionId),
          event_id: eventId,
          call_id: request.callId,
          name,
          arguments: request.arguments,
        },
        HARNESS_CENTRAL_RESULT,
        signal,
      );
    } catch (cause) {
      trace.toolFailed(sessionId, name, cause, { aborted: signal.aborted, startedAt });
      throw cause;
    }
    trace.toolAnswered(sessionId, name, result, startedAt);
    return {
      response: result.response,
      pictures: result.pictures.map((picture) => ({ mediaType: picture.mime, data: picture.data })),
    };
  }

  private context(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof HARNESS_CENTRAL_CONTEXT>> {
    return this.http.call(
      { operation: 'context', claim: this.persistence.claim(sessionId) },
      HARNESS_CENTRAL_CONTEXT,
      signal,
    );
  }

  private async compactionPercent(sessionId: string, signal: AbortSignal): Promise<number> {
    const known = this.compactAt.get(sessionId);
    if (known !== undefined) return known;
    const context = await this.context(sessionId, signal);
    this.compactAt.set(sessionId, context.compact_at_percent);
    return context.compact_at_percent;
  }
}
