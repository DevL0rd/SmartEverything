import { ApiError, type AiAgentRun, type AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { HarnessService } from '../../harness/service';
import type { ChatOwner } from '../chat-directory';
import type { EngineStatus } from '../engines/engine';

const TERMINAL: ReadonlySet<AiAgentRun['state']> = new Set([
  'completed',
  'stopped',
  'interrupted',
  'failed',
]);

interface InactiveRemoval {
  readonly store: Store;
  readonly harness: HarnessService;
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly runId: string;
  readonly status: (chat: AiChatRow) => EngineStatus | null;
}

export function admitInactiveRemoval(deps: InactiveRemoval, scope: readonly AiChatRow[]): void {
  const { store, owner, chatId, runId } = deps;
  const run = store.aiAgentRuns.find(runId);
  const chat = store.aiChats.chat(chatId);
  if (
    run?.profile_id !== owner.profileId ||
    run.child_chat_id !== chat.id ||
    run.parent_chat_id !== chat.parent_id ||
    chat.kind !== 'subagent' ||
    !TERMINAL.has(run.state)
  )
    throw inactiveConflict();
  const parent = store.aiChats.chat(run.parent_chat_id);
  if (parent.profile_id !== owner.profileId) throw inactiveConflict();
  admitRunEvent(store, run, chat, parent);
  admitRunEngine(run, chat, parent);
  for (const target of scope) admitChatInactive(deps, store.aiChats.chat(target.id));
}

function admitRunEvent(store: Store, run: AiAgentRun, chat: AiChatRow, parent: AiChatRow): void {
  if (run.source !== 'smarteverything') throw inactiveConflict();
  if (store.aiAgentRuns.currentChild(chat.id)?.id !== run.id) throw inactiveConflict();
  const event = store.assistantEvents.event(run.source_id);
  if (
    event.chat_id !== chat.id ||
    event.profile_id !== chat.profile_id ||
    event.report_to !== parent.id ||
    event.answered_at === null
  )
    throw inactiveConflict();
}

function admitRunEngine(run: AiAgentRun, chat: AiChatRow, parent: AiChatRow): void {
  const engine = chat.engine;
  if (run.runtime !== (engine.kind === 'openrouter' ? null : engine.kind)) throw inactiveConflict();
  if (engine.kind === 'claude' || engine.kind === 'codex') {
    if (run.device_id !== engine.device_id) throw inactiveConflict();
  }
  if (run.harness !== undefined) admitRunHarness(run.harness, chat, parent);
}

function admitRunHarness(
  harness: NonNullable<AiAgentRun['harness']>,
  chat: AiChatRow,
  parent: AiChatRow,
): void {
  if (
    chat.engine.kind !== 'dsh' ||
    parent.engine.kind !== 'dsh' ||
    chat.engine.session_id !== harness.session_id ||
    parent.engine.session_id !== harness.parent_session_id
  )
    throw inactiveConflict();
}

function admitChatInactive(deps: InactiveRemoval, chat: AiChatRow): void {
  if (
    chat.profile_id !== deps.owner.profileId ||
    deps.status(chat)?.state !== 'ready' ||
    deps.store.assistantEvents.hasUnsettledChatWork(chat.id) ||
    deps.store.aiAgentRuns.ofChat(chat.id).some((run) => !TERMINAL.has(run.state))
  )
    throw inactiveConflict();
  if (chat.engine.kind === 'dsh') admitHarnessInactive(deps, chat);
  else if (chat.engine.kind !== 'openrouter') admitProviderInactive(deps.store, chat);
}

function admitProviderInactive(store: Store, chat: AiChatRow): void {
  const provider = store.aiRuntimeProvider.read(chat.id, false);
  if (chat.engine.kind !== 'claude' && chat.engine.kind !== 'codex') throw inactiveConflict();
  if (
    provider?.runtime !== chat.engine.kind ||
    provider.device_id !== chat.engine.device_id ||
    !['idle', 'completed', 'failed'].includes(provider.state) ||
    provider.prompts.some((prompt) => prompt.status === 'pending')
  )
    throw inactiveConflict();
}

function admitHarnessInactive(deps: InactiveRemoval, chat: AiChatRow): void {
  const session = deps.harness.state(deps.owner, chat.id);
  const handoff = session.handoff;
  if (
    !['idle', 'failed'].includes(session.state) ||
    session.work.length > 0 ||
    session.interactions.length > 0 ||
    session.permission_change !== null ||
    (handoff !== null && (handoff.stage !== 'completed' || handoff.source_outcome !== 'closed'))
  )
    throw inactiveConflict();
}

function inactiveConflict(): ApiError {
  return new ApiError(
    'conflict',
    'This child conversation is active, changed, or has unknown work; its history was retained.',
  );
}
