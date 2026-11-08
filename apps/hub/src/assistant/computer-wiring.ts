import type { ComputerAiDirectory } from '../computers/ai-directory';
import { ClaudeRunner, type ClaudeRunnerDeps } from './engines/claude/runner';
import { CodexRunner } from './engines/codex/runner';
import type { ComputerRunner } from './engines/computer/runner';
import type { AssistantRequests } from './requests';
import type { AssistantServiceOptions } from './service-contract';
export function computerRunners(
  options: AssistantServiceOptions,
  directory: ComputerAiDirectory,
  ports: Pick<ClaudeRunnerDeps, 'conversation' | 'files' | 'tools'> & {
    readonly requests: Pick<AssistantRequests, 'finished' | 'turn'>;
  },
): ReadonlyMap<'claude' | 'codex', ComputerRunner> {
  const { requests, ...runnerPorts } = ports;
  const deps: ClaudeRunnerDeps = {
    ...options,
    ...runnerPorts,
    directory,
    finished: (event, text, ok): void => {
      requests.finished(event, text, ok);
    },
    command: (chat, text): void => {
      requests.turn(chat, text, { source: 'app', plugin_id: null, device_id: null, name: null });
    },
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
