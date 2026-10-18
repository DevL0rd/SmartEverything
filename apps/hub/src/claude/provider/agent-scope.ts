import type { ProviderTurn } from '@smarteverything/domain';
import { effectiveSettingSources } from './configured-options';
import { managedConfiguration } from './managed-project';

export function agentServerNames(turn: ProviderTurn): string[] {
  return Object.values(turn.options.agents ?? {})
    .flatMap((agent) =>
      (agent.mcpServers ?? []).flatMap((server) =>
        typeof server === 'string' ? [server] : Object.keys(server),
      ),
    )
    .filter((server) => server !== 'home');
}

export function nativeSourcesEnabled(turn: ProviderTurn): boolean {
  const options = managedConfiguration(turn);
  return (options.plugins?.length ?? 0) > 0 || effectiveSettingSources(options).length > 0;
}
