import type { ReactNode } from 'react';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { ErrorState } from '../../../components/error-state';
import { List } from '../../../components/section';
import { ValueRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { useRow } from '../../../store/selectors';
import { dateTimeText } from '../../../format/locale';
import { background } from '@smarteverything/logging';

interface RunCommandProps {
  readonly id: string;
}
export function RunCommand({ id }: RunCommandProps): ReactNode {
  const live = useRow('commands', id);
  const query = useScreenQuery({
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
          background(query.refetch(), 'query.refetch_failed');
        }}
      />
    );
  if (row === undefined) return <Text variant="body">Loading command…</Text>;
  return (
    <>
      <List>
        <ValueRow title="Status" value={row.status} />
        <ValueRow title="Capability" value={row.capability} />
        <ValueRow title="Created" value={dateTimeText(new Date(row.created_at))} />
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
