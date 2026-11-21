import {
  ApiError,
  type AiChatRow,
  type AiSubscriptionUsage,
  type ComputerRuntimeProviderTurn,
} from '@smarteverything/domain';
import { helperParentMessageId } from '../../delegation/helper-delivery';
import { admitsChatExecution } from '../../native-helpers';
import { StoreNotFoundError } from '../../../store/context';
import type { ComputerRunnerDeps, Turn } from './ports';
import type { ComputerEvent, ProviderState } from './provider-state';
import type { NativeCommands } from './native-commands';
import { subscriptionUsage } from './subscription-usage';
import { noteContext } from './context-meter';

interface Intake {
  readonly state: ProviderState;
  readonly commands: NativeCommands;
}

async function ownsEvent(intake: Intake, chat: AiChatRow, event: ComputerEvent): Promise<boolean> {
  return (
    (await intake.state.read(chat)).job_id === event.job_id ||
    (await intake.commands.accepted(chat, event))
  );
}

export async function recordedProviderEvent(
  deps: ComputerRunnerDeps,
  intake: Intake,
  chat: AiChatRow,
  event: ComputerEvent,
): Promise<boolean> {
  if (!(await ownsEvent(intake, chat, event))) return false;
  const { store } = deps;
  await store.host.write('computerProviderAgents', {
    chat,
    event,
    now: deps.now().toISOString(),
  });
  if (!(await intake.state.received(chat, event))) return false;
  await intake.commands.received(chat, event);
  const usage = await subscriptionUsage(
    event,
    deps.now().toISOString(),
    async (): Promise<AiSubscriptionUsage | undefined> =>
      (await intake.state.read(chat)).subscription_usage,
  );
  if (usage !== undefined)
    await store.host.write('computerSubscriptionUsage', {
      chat,
      current: usage.current,
      observed: usage.observed,
    });
  await noteContext(store, chat, event);
  return true;
}

export async function failedTurnState(
  state: ProviderState,
  turn: Turn,
  reason: string,
  lifecycle: 'close' | 'retained' | 'unavailable' | 'unknown',
): Promise<void> {
  const current = await state.read(turn.chat);
  if (current.job_id !== turn.jobId) return;
  const failed = {
    ...current,
    reason: reason.slice(0, 2000),
    job_id: lifecycle === 'retained' ? turn.jobId : null,
    prompts: [],
    context: null,
  };
  await state.save(
    turn.chat,
    failed.runtime === 'codex'
      ? { ...failed, state: lifecycle === 'unknown' ? 'unknown' : 'failed' }
      : { ...failed, state: 'failed' },
  );
}

export async function submitFailureLifecycle(
  state: ProviderState,
  turn: Turn,
): Promise<'retained' | 'close'> {
  if (helperParentMessageId(turn.event) === null) return 'close';
  return (await state.read(turn.chat)).job_id === turn.jobId ? 'close' : 'retained';
}

export async function codexStart(
  deps: Pick<ComputerRunnerDeps, 'directory'>,
  input: ComputerRuntimeProviderTurn,
): Promise<string | null> {
  const accepted = await deps.directory.startRuntimeTurn(input);
  if (accepted.reply.operation !== 'provider_start')
    throw new ApiError('upstream_failed', 'Expected provider start acknowledgement.');
  return accepted.reply.value.session_id;
}

export async function arrivedChat(
  deps: Pick<ComputerRunnerDeps, 'store' | 'runtime'>,
  deviceId: string,
  event: ComputerEvent,
): Promise<AiChatRow | null> {
  try {
    const chat = await deps.store.host.call('aiChats', 'chat', event.chat_id);
    return chat.engine.kind === deps.runtime &&
      chat.engine.device_id === deviceId &&
      admitsChatExecution(chat)
      ? chat
      : null;
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return null;
    throw cause;
  }
}
