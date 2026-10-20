import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { useRow } from '../../../store/selectors';
import { NotFound } from '../shared/not-found';
import { ValueEditor } from './value-editor';

interface ExistingValueProps {
  readonly id: string;
  readonly reload: string | undefined;
}
function ExistingValue({ id, reload }: ExistingValueProps): ReactNode {
  const row = useRow('automation_values', id);
  return row === null ? (
    <NotFound title="Value not found" body="It may have been deleted on another device." />
  ) : (
    <ValueEditor key={`${id}:${reload ?? ''}`} row={row} />
  );
}
export function ValueEditorScreen(): ReactNode {
  const params = z
    .object({ variableId: z.string(), reload: z.string().optional() })
    .safeParse(useLocalSearchParams());
  if (!params.success)
    return <NotFound title="Value not found" body="This link doesn’t point to a Value." />;
  return params.data.variableId === 'new' ? (
    <ValueEditor row={null} />
  ) : (
    <ExistingValue id={params.data.variableId} reload={params.data.reload} />
  );
}
