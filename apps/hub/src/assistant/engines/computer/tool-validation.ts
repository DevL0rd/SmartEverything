import { isDeepStrictEqual } from 'node:util';
import { ApiError, isCodexPermissionOnlyChange, type AiChatRow } from '@smarteverything/domain';
import type { ComputerRunnerDeps, Turn } from './ports';
import { eventAuthority, executionRole } from '../../turn-authority';
import { computerEngine, type ComputerEngine } from '../../engine-kind';
import { effectiveClientById } from '../../../server/person-access';
import { effectiveProviderEngine } from './options';
import type { ProviderState } from './provider-state';

type ToolValidationDeps = Pick<ComputerRunnerDeps, 'store' | 'directory' | 'runtime'>;
type BoundToolTurn = Pick<Turn, 'event' | 'chat' | 'jobId' | 'executionEngine'>;
type ToolSession = ReturnType<ProviderState['bound']>;

export function providerToolValidation(
  deps: ToolValidationDeps,
  state: Pick<ProviderState, 'bound'>,
  turn: BoundToolTurn,
  current: () => boolean,
): (write: boolean) => void {
  const issued = state.bound(turn.chat);
  return (write): void => {
    validateOwner(deps.store, turn.event);
    validateSession(turn, issued, state.bound(turn.chat), current());
    const [admitted, effective] = validateEngine(deps, turn);
    if (write && (projectReadOnly(admitted) || projectReadOnly(effective)))
      throw new ApiError(
        'forbidden',
        'The current native permission allows reading project files only.',
      );
  };
}

function validateOwner(store: ToolValidationDeps['store'], event: BoundToolTurn['event']): void {
  const authority = eventAuthority(store, event);
  if (
    executionRole(authority) !== 'owner' ||
    (authority.client_id !== null &&
      effectiveClientById(store, authority.client_id).role !== 'owner')
  )
    throw new ApiError(
      'forbidden',
      'Native project work requires its current initiating owner authority.',
    );
}

function validateSession(
  turn: BoundToolTurn,
  issued: ToolSession,
  binding: ToolSession,
  current: boolean,
): void {
  validateManagedContext(binding);
  if (
    !current ||
    binding.job_id !== turn.jobId ||
    binding.device_id !== turn.chat.engine.device_id ||
    (binding.runtime === 'codex' && !sameCodexSession(issued, binding))
  )
    throw new ApiError('forbidden', 'The native tool call no longer belongs to the current turn.');
}

function validateEngine(
  deps: ToolValidationDeps,
  turn: BoundToolTurn,
): readonly [ComputerEngine, ComputerEngine] {
  const chat = deps.store.aiChats.chat(turn.chat.id);
  const engine = computerEngine(chat.engine);
  const admitted = turn.executionEngine;
  if (engine === null || admitted === null || chat.profile_id !== turn.chat.profile_id)
    throw new ApiError('forbidden', 'The native tool execution binding changed.');
  const effective = toolEngine(deps, engine);
  if (!isDeepStrictEqual(admitted, effective) && !isCodexPermissionOnlyChange(admitted, effective))
    throw new ApiError('forbidden', 'The native tool execution binding changed.');
  return [admitted, effective];
}

export function nativeProjectReadOnly(deps: ToolValidationDeps, chat: AiChatRow): boolean {
  const engine = computerEngine(chat.engine);
  if (engine === null)
    throw new ApiError('forbidden', 'Project permissions require the current native engine.');
  return projectReadOnly(toolEngine(deps, engine));
}

function toolEngine(deps: ToolValidationDeps, engine: ComputerEngine): ComputerEngine {
  const settings = deps.directory.runtimeStatus({
    device_id: engine.device_id,
    runtime: deps.runtime,
  }).settings;
  return effectiveProviderEngine(engine, settings);
}

function projectReadOnly(engine: ComputerEngine): boolean {
  return engine.kind === 'claude'
    ? engine.settings.permission_mode === 'plan'
    : engine.settings.sandbox_policy?.type === 'readOnly';
}

function validateManagedContext(binding: ToolSession): void {
  if (binding.managed_project === undefined) return;
  if (!isDeepStrictEqual(binding.context?.managed_project, binding.managed_project))
    throw new ApiError(
      'forbidden',
      'The admitted native managed project has no matching execution context.',
    );
}

function sameCodexSession(issued: ToolSession, current: ToolSession): boolean {
  return (
    current.session_id === issued.session_id &&
    isDeepStrictEqual(current.context, issued.context) &&
    isDeepStrictEqual(current.managed_project, issued.managed_project)
  );
}
