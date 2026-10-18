import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { AI_PREVIEW_SERVICE_WRITE, AI_PREVIEW_PUBLICATION } from '@smarteverything/domain';
import type { AiPreviewServiceWrite } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessHub } from './http';
import type { HubSessionLog } from './persistence';
export interface NativePreviewAdapter {
  publish(session: string, workspace: string, service: AiPreviewServiceWrite): Promise<string>;
  forget(handle: string): void;
  registerFile(handle: string, session: string, stop: () => void): void;
  reportFileFailure(cause: unknown): void;
}
const REVOKE = z.strictObject({ publication_id: z.uuid() });
const DONE = z.object({ ok: z.literal(true) });
export class NativePreviewTools {
  constructor(
    private readonly http: HarnessHub,
    private readonly persistence: HubSessionLog,
    private readonly adapter: NativePreviewAdapter,
  ) {}
  install(ctx: Context): void {
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
        'operation_failed',
        'Preview publication requires a native chat.',
      );
    const policy = ctx.permissionPresets.resolve(ctx.permissionPresets.current(agent.session));
    if (policy.sandbox === 'read-only')
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Sharing requires current native write authority.',
      );
    const claim = this.persistence.claim(agent.id);
    if (input.name === 'revoke_preview')
      return this.http.call(
        {
          operation: 'preview_revoke',
          claim,
          publication_id: REVOKE.parse(input.raw).publication_id,
        },
        DONE,
        execution.signal,
      );
    const service = AI_PREVIEW_SERVICE_WRITE.parse(input.raw);
    const workspace = ctx.workingDirectory.get(agent.session);
    const handle = await this.adapter.publish(agent.id, workspace, service);
    try {
      return await this.http.call(
        { operation: 'preview_publish', claim, service, workspace, service_handle: handle },
        AI_PREVIEW_PUBLICATION,
        execution.signal,
      );
    } catch (cause) {
      this.adapter.forget(handle);
      throw cause;
    }
  }
}
