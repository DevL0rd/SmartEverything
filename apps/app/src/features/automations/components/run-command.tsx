import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { ErrorState } from '../../../components/error-state';
import { List } from '../../../components/section';
import { ValueRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { useRow } from '../../../store/selectors';

interface RunCommandProps {
  readonly id: string;
}
export function RunCommand({ id }: RunCommandProps): ReactNode {
  const live = useRow('commands', id);
  const query = useQuery({
    queryKey: ['run-command', id],
    queryFn: () => api().call(E.readCommand, { params: { commandId: id } }),
    retry: false,
  });
  const row = live ?? query.data;
  if (query.error !== null)
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  if (row === undefined) return <Text variant="body">Loading command…</Text>;
  return (
    <>
      <List>
        <ValueRow title="Status" value={row.status} />
        <ValueRow title="Capability" value={row.capability} />
        <ValueRow title="Created" value={new Date(row.created_at).toLocaleString()} />
      </List>
      <Text
        variant="footnote"
        selectable
      >{`Command ${row.id}\nValue ${JSON.stringify(row.value)}\nResult ${JSON.stringify(row.result)}`}</Text>
      {row.error === null ? null : (
        <Text variant="callout" tone="critical" selectable>
          {row.error}
        </Text>
      )}
    </>
  );
}
