import type { ProviderTurn } from '@smarteverything/domain';

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
  return (turn.options.plugins?.length ?? 0) > 0 || (turn.options.setting_sources?.length ?? 0) > 0;
}
