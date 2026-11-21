import { isDeepStrictEqual } from 'node:util';
import { ApiError, isCodexPermissionOnlyChange, type AiChatRow } from '@smarteverything/domain';
import type { ComputerRunnerDeps, Turn } from './ports';
import { authorityScope, executionRole, type AuthorityScope } from '../../turn-authority';
import { computerEngine, type ComputerEngine } from '../../engine-kind';
import { effectiveProviderEngine } from './options';
import type { ProviderState } from './provider-state';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { LiveCheck } from '../../../harness/live-check';

type ToolValidationDeps = Pick<ComputerRunnerDeps, 'store' | 'directory' | 'runtime'>;
type BoundToolTurn = Pick<Turn, 'event' | 'chat' | 'jobId' | 'executionEngine'>;
type ToolSession = Awaited<ReturnType<ProviderState['bound']>>;

interface ToolBinding {
  readonly binding: ToolSession;
  readonly chat: AiChatRow;
}

export interface ProviderToolValidation {
  readonly validate: (write: boolean) => void;
  readonly settled: () => Promise<void>;
  readonly stop: () => void;
}

export async function providerToolValidation(
  deps: ToolValidationDeps,
  state: Pick<ProviderState, 'bound'>,
  turn: BoundToolTurn,
  current: () => boolean,
): Promise<ProviderToolValidation> {
  const issued = await state.bound(turn.chat);
  const scope = authorityScope();
  const live = await LiveCheck.start(deps.store, async (): Promise<ToolBinding> => {
    await validateOwner(deps.store, turn.event, scope);
    return {
      binding: await state.bound(turn.chat),
      chat: await deps.store.host.call('aiChats', 'chat', turn.chat.id),
    };
  });
  return {
    validate: (write): void => {
      const { binding, chat } = live.value();
      validateSession(turn, issued, binding, current());
      const [admitted, effective] = validateEngine(deps, turn, chat);
      if (write && (projectReadOnly(admitted) || projectReadOnly(effective)))
        throw new ApiError(
          'forbidden',
          'The current native permission allows reading project files only.',
        );
    },
    settled: (): Promise<void> => live.idle(),
    stop: (): void => {
      live.stop();
    },
  };
}

async function validateOwner(
  store: ToolValidationDeps['store'],
  event: StoredEvent,
  scope: AuthorityScope,
): Promise<void> {
  const { authority, clientRole } = await store.host.read('assistantEventAuthorityView', {
    event,
    scope,
  });
  if (executionRole(authority) !== 'owner' || (clientRole !== null && clientRole !== 'owner'))
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
  chat: AiChatRow,
): readonly [ComputerEngine, ComputerEngine] {
  const engine = computerEngine(chat.engine);
  const admitted = turn.executionEngine;
  if (engine === null || admitted === null || chat.profile_id !== turn.chat.profile_id)
    throw new ApiError('forbidden', 'The native tool execution binding changed.');
  const effective = toolEngine(deps, engine);
  if (!isDeepStrictEqual(admitted, effective) && !isCodexPermissionOnlyChange(admitted, effective))
    throw new ApiError('forbidden', 'The native tool execution binding changed.');
  return [admitted, effective];
}

export function nativeProjectReadOnly(
  deps: Pick<ToolValidationDeps, 'directory' | 'runtime'>,
  chat: AiChatRow,
): boolean {
  const engine = computerEngine(chat.engine);
  if (engine === null)
    throw new ApiError('forbidden', 'Project permissions require the current native engine.');
  return projectReadOnly(toolEngine(deps, engine));
}

function toolEngine(
  deps: Pick<ToolValidationDeps, 'directory' | 'runtime'>,
  engine: ComputerEngine,
): ComputerEngine {
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
