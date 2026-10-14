import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import {
  AI_PREVIEW_SERVICE_WRITE,
  AI_PREVIEW_PUBLICATION,
  JSON_VALUE,
} from '@smarteverything/domain';
import type { AiPreviewServiceWrite, JsonValue } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessHttp } from './http';
import type { HttpHarnessPersistence } from './persistence';
export interface NativePreviewAdapter {
  publish(session: string, workspace: string, service: AiPreviewServiceWrite): Promise<string>;
  forget(handle: string): void;
  registerFile(handle: string, session: string, stop: () => void): void;
  reportFileFailure(cause: unknown): void;
}
const REVOKE = z.strictObject({ publication_id: z.uuid() });
const DONE = z.object({ ok: z.literal(true) });
const CALL = z.object({ callId: z.string(), name: z.string(), arguments: z.string() });
export class NativePreviewTools {
  private readonly calls = new Map<
    string,
    { readonly seq: number; readonly args: string; readonly name: string }
  >();
  constructor(
    private readonly http: HarnessHttp,
    private readonly persistence: HttpHarnessPersistence,
    private readonly adapter: NativePreviewAdapter,
  ) {}
  install(ctx: Context): void {
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'tool/call') return;
      const call = CALL.parse(event.data);
      if (!['publish_preview', 'revoke_preview'].includes(call.name)) return;
      this.calls.set(`${session.id}:${call.callId}`, {
        seq: event.seq,
        args: call.arguments,
        name: call.name,
      });
    });
    ctx.on('tools/result', (execution) => {
      if (execution.agent !== undefined)
        this.calls.delete(`${execution.agent.id}:${execution.callId}`);
    });
    for (const definition of [
      {
        name: 'publish_preview',
        description:
          'Explicitly share one authorized workspace HTTP(S) service with this chat. Give the literal loopback origin and exact port, and confirm service_scope authorized_workspace_service. Never share unrelated/admin services. A restart requires a new publication.',
        schema: AI_PREVIEW_SERVICE_WRITE,
      },
      {
        name: 'revoke_preview',
        description:
          'Revoke one service shared by this native chat and close all its remote browser streams.',
        schema: REVOKE,
      },
    ]) {
      const parameters = z.toJSONSchema(definition.schema, { io: 'input' });
      if (parameters.type !== 'object')
        throw new HarnessRuntimeError(
          'composition_incompatible',
          'Preview tool schema must be an object.',
        );
      ctx.tools.register({
        name: definition.name,
        description: definition.description,
        parameters: { ...parameters, type: 'object' },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute: (raw, execution) => this.execute(ctx, { name: definition.name, raw }, execution),
      });
    }
  }
  private async execute(
    ctx: Context,
    input: { readonly name: string; readonly raw: unknown },
    execution: ToolRunContext,
  ): Promise<unknown> {
    const agent = execution.agent;
    if (agent === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Preview publication requires an owned native chat.',
      );
    const policy = ctx.permissionPresets.resolve(ctx.permissionPresets.current(agent.session));
    if (policy.sandbox === 'read-only')
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Sharing requires current native write authority.',
      );
    const call = this.calls.get(`${agent.id}:${execution.callId}`);
    const raw = z.record(z.string(), JSON_VALUE).parse(input.raw);
    if (call?.name !== input.name || JSON.stringify(JSON.parse(call.args)) !== JSON.stringify(raw))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'The preview grant has no exact native tool lineage.',
      );
    const claim = this.persistence.claim(agent.id);
    await this.persistence.verify(claim);
    await ctx.sessions.flush(agent.session);
    const lineage = { call_id: execution.callId, call_seq: call.seq, arguments: raw };
    if (input.name === 'revoke_preview')
      return this.http.call(
        {
          operation: 'preview_revoke',
          claim,
          publication_id: REVOKE.parse(raw).publication_id,
          ...lineage,
        },
        DONE,
        execution.signal,
      );
    return this.publish(ctx, { agent, claim, raw, lineage }, execution);
  }
  private async publish(
    ctx: Context,
    input: {
      readonly agent: NonNullable<ToolRunContext['agent']>;
      readonly claim: ReturnType<HttpHarnessPersistence['claim']>;
      readonly raw: Readonly<Record<string, JsonValue>>;
      readonly lineage: {
        readonly call_id: string;
        readonly call_seq: number;
        readonly arguments: Readonly<Record<string, JsonValue>>;
      };
    },
    execution: ToolRunContext,
  ): Promise<unknown> {
    const { agent, claim, raw, lineage } = input;
    const service = AI_PREVIEW_SERVICE_WRITE.parse(raw);
    const workspace = ctx.workingDirectory.get(agent.session);
    const handle = await this.adapter.publish(agent.id, workspace, service);
    try {
      return await this.http.call(
        {
          operation: 'preview_publish',
          claim,
          service,
          workspace,
          service_handle: handle,
          ...lineage,
        },
        AI_PREVIEW_PUBLICATION,
        execution.signal,
      );
    } catch (cause) {
      this.adapter.forget(handle);
      throw cause;
    }
  }
}
