import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentRun, SubagentResult } from '@deepseek-ai/dsh-subagent';
import {
  type HARNESS_PLUGIN_AGENT_RESULT,
  JSON_VALUE,
  type HarnessTransportRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginAgentPort, PluginAgentCall } from '../composition/plugin-agent-port';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';

type Request = Extract<HarnessTransportRequest['request'], { operation: 'plugin_agent' }>;
type Result = z.infer<typeof HARNESS_PLUGIN_AGENT_RESULT>;
const CALL = z.object({ callId: z.string(), name: z.string(), arguments: z.string() });
export class DurablePluginAgents implements PluginAgentPort {
  private readonly calls = new Map<
    string,
    { readonly seq: number; readonly name: string; readonly arguments: string }
  >();
  constructor(
    private readonly persistence: HarnessControlPersistence,
    private readonly dispatch: (request: Request, signal?: AbortSignal) => Promise<Result>,
  ) {}
  install(ctx: Context): void {
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
      if (execution.agent !== undefined)
        this.calls.delete(`${execution.agent.id}:${execution.callId}`);
    });
    ctx.effect(() => (): void => {
      this.calls.clear();
    });
  }
  async start(ctx: Context, input: PluginAgentCall): Promise<SubagentRun> {
    const { execution } = input;
    const request = await this.request(ctx, input);
    const accepted = await this.dispatch(request, execution.signal);
    return this.execution(request, accepted);
  }
  private async request(ctx: Context, input: PluginAgentCall): Promise<Request> {
    const { execution, helper, raw, asset } = input;
    const parent = execution.agent;
    if (parent === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Helper delegation requires an owned native conversation.',
      );
    const call = this.calls.get(`${parent.id}:${execution.callId}`);
    const args = z.record(z.string(), JSON_VALUE).parse(raw);
    if (
      call?.name !== `subagent_${helper}` ||
      JSON.stringify(JSON.parse(call.arguments)) !== JSON.stringify(args)
    )
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Helper call has no exact native event lineage.',
      );
    await ctx.sessions.flush(parent.session);
    return {
      operation: 'plugin_agent',
      configuration_revision: input.revision,
      action: 'start',
      claim: this.persistence.claim(parent.id),
      call_id: execution.callId,
      call_seq: call.seq,
      name: call.name,
      arguments: args,
      asset_id: asset.id,
      helper,
    };
  }
  private execution(request: Request, accepted: Result): SubagentRun {
    let terminal = false;
    let cancellation: Promise<void> | undefined;
    const result = this.observe(request, accepted, (): void => {
      terminal = true;
    });
    return {
      id: SessionId(accepted.child_id),
      result,
      dispose: (): Promise<void> => {
        if (terminal) return Promise.resolve();
        cancellation ??= this.dispatch({ ...request, action: 'cancel' }).then(
          async (): Promise<void> => {
            await result;
          },
        );
        return cancellation;
      },
    };
  }
  private async observe(
    request: Request,
    initial: Result,
    settled: () => void,
  ): Promise<SubagentResult> {
    const current = await this.dispatch(
      { ...request, action: 'result' },
      new AbortController().signal,
    );
    if (
      current.child_id !== initial.child_id ||
      current.run_id !== initial.run_id ||
      current.state === 'queued' ||
      current.state === 'running'
    )
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Helper completion has no exact settled child identity.',
      );
    settled();
    return {
      output: current.text === null ? [] : [{ type: 'text', text: current.text }],
      stopReason:
        current.state === 'completed'
          ? 'completed'
          : current.state === 'interrupted'
            ? 'aborted'
            : 'error',
    };
  }
}
