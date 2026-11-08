import type { Context } from '@deepseek-ai/cordis';
import PtcRuntimeNode from '@deepseek-ai/dsh-ptc-runtime-node';
import * as ToolRalph from '@deepseek-ai/dsh-tool-ralph';
import * as ToolWorkflow from '@deepseek-ai/dsh-tool-workflow';
import PtcWorkflow from '@deepseek-ai/dsh-workflow-ptc';
import { configured, provideAgentLoopSettings } from './goals';

export const name = 'loops';

async function mountLoops(scope: Context): Promise<void> {
  const { code, workflow, ralph } = scope.agentLoopSettings.settings;
  await scope.plugin(PtcRuntimeNode, {
    executionMode: 'per-call',
    ...configured([
      ['maxOutputBytes', code.max_output_bytes],
      ['maxOldGenerationSizeMb', code.max_heap_mb],
      ['maxMessageBytes', code.max_message_bytes],
      ['maxPendingCalls', code.max_pending_calls],
      ['graceMs', code.grace_ms],
    ]),
  });
  await scope.plugin(
    PtcWorkflow,
    configured([
      ['maxConcurrentAgents', workflow.max_concurrent_agents],
      ['maxTotalAgents', workflow.max_total_agents],
      ['maxItemsPerCall', workflow.max_items_per_call],
      ['syncTimeoutMs', workflow.sync_timeout_ms],
    ]),
  );
  await scope.plugin(ToolWorkflow, configured([['maxResultChars', workflow.result_chars]]));
  await scope.plugin(
    ToolRalph,
    configured([
      ['maxRounds', ralph.max_rounds],
      ['maxHandoffChars', ralph.handoff_chars],
      ['maxResultChars', ralph.result_chars],
    ]),
  );
}

export async function mount(ctx: Context): Promise<void> {
  await provideAgentLoopSettings(ctx);
  await ctx.inject(['agentLoopSettings'], mountLoops);
}
