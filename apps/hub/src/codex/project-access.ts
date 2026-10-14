import type { CodexProviderTurn } from '@smarteverything/domain';
import { CodexRuntimeError } from './errors';
export function requireLocalProject(turn: CodexProviderTurn): void {
  if (turn.managed_project !== undefined)
    throw new CodexRuntimeError(
      'project',
      'A complete central-only tool boundary is unavailable in this Codex adapter. Its native local and external tool sources cannot yet be restricted by an immutable, fail-closed managed-project grant. Select an explicit device project.',
    );
}
