import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { api } from '../../../../api/transport';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { useRow } from '../../../../store/selectors';

type CommandRow = NonNullable<ReturnType<typeof useRow<'commands'>>>;

export interface CommandView {
  readonly row: CommandRow | null;
  readonly query: UseQueryResult<CommandRow>;
}

export function useCommand(id: string): CommandView {
  const live = useRow('commands', id);
  const query = useScreenQuery({
    queryKey: ['automations-v3', 'command', id],
    queryFn: () => api().call(E.readCommand, { params: { commandId: id } }),
    retry: false,
  });
  return { row: live ?? query.data ?? null, query };
}
