import { useCommandPreparation } from './preparation';
import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import type { Engine, AiHarnessCatalogue } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import {
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessSession,
  type AiHarnessHost,
  type AiHarnessCommandScope,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useActiveProfile } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
const connections = new WeakMap<ReturnType<typeof api>, string>();
function connectionId(live: boolean): string {
  if (!live) return 'offline';
  const client = api();
  const existing = connections.get(client);
  if (existing !== undefined) return existing;
  const id = randomUUID();
  connections.set(client, id);
  return id;
}
interface BindingInput {
  readonly chat: AiChatRow | undefined;
  readonly state: AiHarnessSession | undefined;
  readonly host: AiHarnessHost | undefined;
  readonly live: boolean;
  readonly profileId: string | undefined;
}
export interface DshCommandBinding {
  readonly key: string;
  readonly chatId: string | null;
  readonly scope: AiHarnessCommandScope | null;
  readonly reason: string | null;
  readonly retry: () => void;
}
export function useDshCommandBinding(
  chat: AiChatRow | undefined,
  opened: boolean,
): DshCommandBinding {
  const profile = useActiveProfile();
  const live = useSyncStatus().status === 'live';
  const own = ownEngine(chat);
  const session = useChatHarness(chat?.id ?? '', hasSession(own));
  const preparation = useCommandPreparation(chat, opened, connectionId(live));
  const catalogue = useHarnessCatalogue();
  const host = selectedHost(catalogue.data, own, preparation.data);
  const input = {
    chat,
    state: session.data ?? preparation.data,
    host,
    live,
    profileId: profile?.id,
  };
  const scope = boundScope(input);
  return {
    key: scopeKey(input, scope),
    chatId: chat?.id ?? null,
    scope,
    reason: preparation.isFetching
      ? 'Finding commands…'
      : bindingProblem(input, scope, session.error ?? preparation.error, catalogue.error),
    retry: (): void => {
      void preparation.refetch();
      if (hasSession(own)) void session.refetch();
      void catalogue.refetch();
    },
  };
}
function boundScope(input: BindingInput): AiHarnessCommandScope | null {
  const { chat, state, profileId } = input;
  if (chat === undefined || state?.epoch === undefined || state.epoch === null) return null;
  if (state.metadata.chat_id !== chat.id || state.metadata.profile_id !== profileId) return null;
  if (!sameSelection(chat.engine, state)) return null;
  return { session_id: state.session_id, expected_epoch: state.epoch };
}
function sameSelection(engine: Engine, state: AiHarnessSession): boolean {
  if (engine.kind === 'openrouter')
    return (
      state.target.kind === 'server' &&
      (engine.model === null || engine.model === state.route.model)
    );
  if (engine.kind !== 'dsh') return false;
  if (engine.session_id !== null && state.session_id !== engine.session_id) return false;
  return (
    JSON.stringify([
      harnessTargetKey(state.target),
      state.route.route_id,
      state.route.model,
      state.route.effort,
      state.permission,
    ]) ===
    JSON.stringify([
      harnessTargetKey(engine.execution_target),
      engine.model_route_id,
      engine.model,
      engine.effort,
      engine.permission,
    ])
  );
}
function scopeKey(input: BindingInput, scope: AiHarnessCommandScope | null): string {
  const { chat, host, state } = input;
  return JSON.stringify([
    connectionId(input.live),
    input.profileId,
    chat?.id,
    scope,
    host === undefined
      ? null
      : [host.target, host.connection_generation, host.runtime_instance, host.manifest],
    state === undefined ? null : [state.permission, state.permission_change, state.route],
  ]);
}
function unavailable(input: BindingInput, scope: AiHarnessCommandScope | null): string | null {
  const { chat, host, state } = input;
  if (!input.live) return 'Reconnect to see commands for this chat.';
  if (chat === undefined) return 'Finding commands…';
  if (chat.engine.kind !== 'dsh' && chat.engine.kind !== 'openrouter') return 'Finding commands…';
  if (host === undefined || state === undefined) return 'Finding commands…';
  return hostUnavailable(host) ?? sessionUnavailable(state, scope);
}
function hostUnavailable(host: AiHarnessHost): string | null {
  if (!host.online) return 'Reconnect the selected host to use commands here.';
  return host.manifest?.human_commands === true
    ? null
    : 'Update the selected host to use commands here.';
}
function sessionUnavailable(
  state: AiHarnessSession,
  scope: AiHarnessCommandScope | null,
): string | null {
  return scope === null ||
    ['switching', 'unavailable', 'failed'].includes(state.state) ||
    pendingPermission(state)
    ? 'The session binding is unavailable. Refresh commands to continue.'
    : null;
}

function ownEngine(chat: AiChatRow | undefined): Extract<Engine, { kind: 'dsh' }> | null {
  return chat?.engine.kind === 'dsh' ? chat.engine : null;
}
function selectedHost(
  catalogue: AiHarnessCatalogue | undefined,
  engine: Extract<Engine, { kind: 'dsh' }> | null,
  session: AiHarnessSession | undefined,
): AiHarnessHost | undefined {
  const target = engine?.execution_target ?? session?.target;
  if (target === undefined) return undefined;
  return catalogue?.hosts.find(
    (host) => harnessTargetKey(host.target) === harnessTargetKey(target),
  );
}
function pendingPermission(state: AiHarnessSession): boolean {
  return state.permission_change !== undefined && state.permission_change !== null;
}

function hasSession(engine: Extract<Engine, { kind: 'dsh' }> | null): boolean {
  return engine !== null && engine.session_id !== null;
}

function bindingProblem(
  input: BindingInput,
  scope: AiHarnessCommandScope | null,
  sessionError: Error | null,
  catalogueError: Error | null,
): string | null {
  if (sessionError !== null || catalogueError !== null) return CHAT_ERROR_MESSAGE;
  return unavailable(input, scope);
}
