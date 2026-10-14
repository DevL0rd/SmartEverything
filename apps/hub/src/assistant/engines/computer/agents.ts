import {
  CODEX_PROVIDER_EVENT,
  type AiChatRow,
  type AiAgentRun,
  type AiChatRuntimeProvider,
  type CodexProviderEvent,
} from '@smarteverything/domain';
import type { ComputerRunnerDeps } from './runner';
import type { ComputerEvent } from './provider-state';
import { claudeAgents } from '../claude/agents';
export function providerAgents(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  event: ComputerEvent,
): void {
  if (chat.engine.kind === 'codex') {
    codexAgents(deps, chat, event);
    return;
  }
  if (event.kind === 'failed') {
    lostAgents(deps, chat, event);
    return;
  }
  if (chat.engine.kind === 'claude') {
    claudeAgents(deps, chat, event);
    return;
  }
}
function codexAgents(deps: ComputerRunnerDeps, chat: AiChatRow, event: ComputerEvent): void {
  const parsed = CODEX_PROVIDER_EVENT.safeParse(event);
  if (!parsed.success || chat.engine.kind !== 'codex') return;
  const source = parsed.data;
  const state = deps.store.aiRuntimeProvider.read(chat.id, false);
  if (
    state?.runtime !== 'codex' ||
    state.device_id !== chat.engine.device_id ||
    !matchesSource(state, source, chat.id)
  )
    return;
  if (source.kind === 'failed') {
    lostAgents(deps, chat, source);
    return;
  }
  if (source.kind !== 'agent' || !matchesRun(source.run, source, chat, state.device_id)) return;
  deps.store.aiAgentRuns.upsert({ ...source.run, supported_actions: [] });
}

function matchesSource(
  state: Extract<AiChatRuntimeProvider, { runtime: 'codex' }>,
  event: CodexProviderEvent,
  chatId: string,
): boolean {
  return (
    event.chat_id === chatId &&
    state.job_id === event.job_id &&
    state.context?.process_generation === event.process_generation &&
    state.session_id !== null &&
    state.session_id === event.thread_id
  );
}

function matchesRun(
  run: AiAgentRun,
  event: CodexProviderEvent,
  chat: AiChatRow,
  deviceId: string,
): boolean {
  return (
    run.source === 'codex' &&
    run.parent_chat_id === chat.id &&
    run.profile_id === chat.profile_id &&
    run.device_id === deviceId &&
    run.runtime === 'codex' &&
    run.job_id === event.job_id &&
    run.source_generation === event.process_generation &&
    run.session_id !== null &&
    run.child_chat_id === null
  );
}

function lostAgents(deps: ComputerRunnerDeps, chat: AiChatRow, event: ComputerEvent): void {
  for (const run of deps.store.aiAgentRuns.list(chat.id, { limit: 200 }).runs) {
    if (
      run.source === 'smarteverything' ||
      run.job_id !== event.job_id ||
      !['queued', 'running', 'waiting', 'stopping'].includes(run.state)
    )
      continue;
    deps.store.aiAgentRuns.upsert({
      ...run,
      state: 'unknown',
      last_known_state: run.state,
      observability_reason: 'The provider connection ended before a child completion was observed.',
      updated_at: deps.now().toISOString(),
      source_seq: run.source_seq + 1,
      supported_actions: [],
    });
  }
}
