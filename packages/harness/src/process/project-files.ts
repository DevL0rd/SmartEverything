import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { AI_PROJECT_RESULT, JSON_VALUE } from '@smarteverything/domain';
import type {
  AiProjectRequest,
  AiProjectResult,
  HarnessTransportRequest,
} from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';
import type { ProjectFilePort } from '../composition/project-files';

type Request = Extract<HarnessTransportRequest['request'], { operation: 'project_file' }>;
const CALL = z.object({ callId: z.string(), name: z.string(), arguments: z.string() });
export class NativeProjectFiles {
  private readonly calls = new Map<
    string,
    { readonly seq: number; readonly name: string; readonly arguments: string }
  >();
  private ctx: Context | undefined;
  constructor(
    private readonly persistence: HarnessControlPersistence,
    private readonly transport: (request: Request, signal: AbortSignal) => Promise<unknown>,
  ) {}
  install(ctx: Context): void {
    this.ctx = ctx;
    ctx.on('session/event', (session, event): void => {
      if (event.type !== 'tool/call') return;
      const call = CALL.parse(event.data);
      this.calls.set(`${session.id}:${call.callId}`, {
        seq: event.seq,
        name: call.name,
        arguments: call.arguments,
      });
    });
    ctx.on('tools/result', (execution) => {
      if (execution.agent !== undefined)
        this.calls.delete(`${execution.agent.id}:${execution.callId}`);
      return undefined;
    });
    ctx.effect(() => (): void => {
      this.calls.clear();
      this.ctx = undefined;
    });
  }
  readonly execute: ProjectFilePort = async (
    execution: Readonly<ToolExecution>,
    file: AiProjectRequest,
  ): Promise<AiProjectResult> => {
    const agent = execution.agent;
    const ctx = this.ctx;
    if (agent === undefined || ctx === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central files require an owned native conversation.',
      );
    const call = this.calls.get(`${agent.id}:${execution.callId}`);
    const args = z.record(z.string(), JSON_VALUE).parse(execution.arguments);
    if (call?.name !== execution.name || !isDeepStrictEqual(JSON.parse(call.arguments), args))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central file call has no exact native event lineage.',
      );
    const name = z.enum(['read', 'read_image', 'write', 'edit']).parse(execution.name);
    const bounded =
      file.operation === 'edit'
        ? { ...file, old_string: '#native-canonical', new_string: '#native-canonical' }
        : file;
    await ctx.sessions.flush(agent.session);
    return AI_PROJECT_RESULT.parse(
      await this.transport(
        {
          operation: 'project_file',
          claim: this.persistence.claim(agent.id),
          call_id: execution.callId,
          call_seq: call.seq,
          name,
          arguments_hash: createHash('sha256').update(call.arguments).digest('hex'),
          file: bounded,
        },
        execution.signal,
      ),
    );
  };
}
