import { CommandBindingError } from './types';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { AiChatRow } from '@smarteverything/domain';
import { useCommandBinding } from './binding';
import { commandAdapter } from './adapters';
import type { CommandBinding, CommandDescriptor, CommandScope, DiscoveredCommands } from './types';
import { background } from '@smarteverything/logging';
const COMMAND_QUERY_PREFIX = ['window', 'ai-harness-commands'] as const;
export interface CommandCatalogue extends CommandBinding {
  readonly scope: CommandScope | null;
  readonly commands: readonly CommandDescriptor[];
  readonly error: boolean;
}
async function discover(binding: CommandBinding): Promise<DiscoveredCommands> {
  if (binding.target === null)
    throw new CommandBindingError(
      'Commands require an exact runtime binding.',
      'bound runtime',
      'unbound',
    );
  return commandAdapter(binding.target.kind).discover(binding);
}
export function useCommands(chat: AiChatRow | undefined, opened: boolean): CommandCatalogue {
  const binding = useCommandBinding(chat, opened);
  const query = useScreenQuery({
    queryKey: [...COMMAND_QUERY_PREFIX, binding.key, binding.discoveryKey],
    enabled: opened && binding.reason === null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => discover(binding),
  });
  return {
    ...binding,
    scope: binding.reason === null ? (query.data?.scope ?? null) : null,
    commands: binding.reason === null ? (query.data?.commands ?? []) : [],
    reason: catalogueReason(binding, query),
    error: query.error !== null,
    retry: (): void => {
      binding.retry();
      background(query.refetch(), 'query.refetch_failed');
    },
  };
}

function catalogueReason(
  binding: CommandBinding,
  query: ReturnType<typeof useScreenQuery<DiscoveredCommands>>,
): string | null {
  if (query.error !== null) return 'Couldn’t load commands.';
  return binding.reason ?? (query.isFetching ? 'Finding commands…' : null);
}
