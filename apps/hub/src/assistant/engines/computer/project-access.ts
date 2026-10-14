import { ApiError, type NativeManagedProject, type AiChatRow } from '@smarteverything/domain';
import type { ComputerRunnerDeps } from './ports';

export function managedProviderProject(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  sessionId: string | null,
  cwd: string | undefined,
): NativeManagedProject | undefined {
  if (chat.engine.kind !== 'claude' && chat.engine.kind !== 'codex')
    throw new ApiError('conflict', 'Managed native projects require a native engine.');
  const bound = managedBinding(deps, chat.id);
  if (cwd !== undefined) {
    if (hasManagedSession(bound, sessionId))
      throw new ApiError(
        'conflict',
        'Close the managed native session before selecting a device project.',
      );
    return undefined;
  }
  if (sessionId !== null && bound === undefined) return undefined;
  const target = { device_id: chat.engine.device_id, runtime: chat.engine.kind };
  if (deps.directory.runtimeStatus(target).capabilities.managed_projects?.protocol !== 1)
    throw new ApiError(
      'conflict',
      `This ${target.runtime} runtime cannot restrict all local file and shell tools for central project editing. Select an explicit device project, or use a runtime advertising managed-project protocol 1.`,
    );
  validateManagedBinding(bound, chat.id);
  return { protocol: 1, chat_id: chat.id };
}

function managedBinding(deps: ComputerRunnerDeps, chat: string): NativeManagedProject | undefined {
  return deps.store.aiRuntimeProvider.read(chat, false)?.context?.managed_project;
}
function hasManagedSession(
  bound: NativeManagedProject | undefined,
  sessionId: string | null,
): boolean {
  return bound !== undefined && sessionId !== null;
}

function validateManagedBinding(bound: NativeManagedProject | undefined, chat: string): void {
  if (bound !== undefined && bound.chat_id !== chat)
    throw new ApiError('forbidden', 'The native managed project belongs to another chat.');
}

export function managedProviderInstructions(
  system: string,
  project: NativeManagedProject | undefined,
): string {
  if (project === undefined) return system;
  return `${system}\nAuthored files belong to this chat's central managed project. Discover home project file and preview tools. The native runtime directory is runtime state, not project storage. Local file, shell, agent and external tool sources are unavailable in this session.`;
}
