import type { ComputerAiDirectory } from '../computers/ai-directory';
import { ClaudeRunner, type ClaudeRunnerDeps } from './engines/claude/runner';
import { CodexRunner } from './engines/codex/runner';
import type { ComputerRunner } from './engines/computer/runner';
import type { AssistantServiceOptions } from './service-contract';
export function computerRunners(
  options: AssistantServiceOptions,
  directory: ComputerAiDirectory,
  ports: Pick<ClaudeRunnerDeps, 'conversation' | 'files' | 'tools' | 'finished' | 'command'>,
): ReadonlyMap<'claude' | 'codex', ComputerRunner> {
  const deps = {
    ...options,
    ...ports,
    directory,
    providerNotice: (
      notice: Parameters<ClaudeRunnerDeps['providerNotice']>[0],
      profileId: string,
    ): void => {
      options.providerNotice?.(notice, profileId);
    },
  };
  return new Map([
    ['claude', new ClaudeRunner(deps)],
    ['codex', new CodexRunner(deps)],
  ]);
}
