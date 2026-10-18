import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentRun, SubagentResult } from '@deepseek-ai/dsh-subagent';
import {
  JSON_VALUE,
  type DshWriterClaim,
  type HARNESS_PLUGIN_AGENT_RESULT,
  type HarnessTransportRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginAgentPort, PluginAgentCall } from '../composition/plugin-agent-port';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';

type Request = Extract<
  HarnessTransportRequest['request'],
  { operation: 'plugin_agent' | 'plugin_agent_control' }
>;
type Result = z.infer<typeof HARNESS_PLUGIN_AGENT_RESULT>;
export class DurablePluginAgents implements PluginAgentPort {
  constructor(
    private readonly persistence: HarnessControlPersistence,
    private readonly dispatch: (request: Request, signal?: AbortSignal) => Promise<Result>,
  ) {}
  async start(_ctx: Context, input: PluginAgentCall): Promise<SubagentRun> {
    const { execution, helper, raw, asset } = input;
    const parent = execution.agent;
    if (parent === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Helper delegation requires a native conversation.',
      );
    const claim = this.persistence.claim(parent.id);
    const accepted = await this.dispatch(
      {
        operation: 'plugin_agent',
        claim,
        configuration_revision: input.revision,
        arguments: z.record(z.string(), JSON_VALUE).parse(raw),
        asset_id: asset.id,
        helper,
      },
      execution.signal,
    );
    return this.execution(claim, accepted);
  }
  private execution(claim: DshWriterClaim, accepted: Result): SubagentRun {
    let terminal = false;
    let cancellation: Promise<void> | undefined;
    const control = (action: 'result' | 'cancel', signal?: AbortSignal): Promise<Result> =>
      this.dispatch(
        { operation: 'plugin_agent_control', claim, action, run_id: accepted.run_id },
        signal,
      );
    const result = this.observe(control, (): void => {
      terminal = true;
    });
    return {
      id: SessionId(accepted.child_id),
      result,
      dispose: (): Promise<void> => {
        if (terminal) return Promise.resolve();
        cancellation ??= control('cancel').then(async (): Promise<void> => {
          await result;
        });
        return cancellation;
      },
    };
  }
  private async observe(
    control: (action: 'result', signal: AbortSignal) => Promise<Result>,
    settled: () => void,
  ): Promise<SubagentResult> {
    const current = await control('result', new AbortController().signal);
    if (current.state === 'queued' || current.state === 'running')
      throw new HarnessRuntimeError('operation_failed', 'Helper finished without a result.');
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
