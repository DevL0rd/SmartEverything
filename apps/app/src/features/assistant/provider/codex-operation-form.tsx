import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CODEX_PROVIDER_CONTROL, CODEX_PROVIDER_READ_QUERY } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { OperationFields, initialFields } from './operation-fields';
import type { CodexOperation } from './codex-operations';
import { useCodexControl, useCodexRead } from './codex-provider-data';
import { ProviderResult } from './provider-result';
import { QueryState } from '../../computers';
import type { z } from 'zod';
import { background } from '@smarteverything/logging';
function ReadResult({
  chatId,
  query,
}: {
  readonly chatId: string;
  readonly query: z.output<typeof CODEX_PROVIDER_READ_QUERY>;
}): ReactNode {
  const read = useCodexRead(chatId, query, true);
  return (
    <>
      <QueryState
        error={read.error}
        pending={read.isPending}
        retry={() => {
          background(read.refetch(), 'read.refetch_failed');
        }}
      />
      {read.data === undefined ? null : <ProviderResult value={read.data} />}
    </>
  );
}
export function CodexOperationForm({
  chatId,
  operation,
  sessionId,
}: {
  readonly chatId: string;
  readonly operation: CodexOperation;
  readonly sessionId: string | null;
}): ReactNode {
  const [fields, change] = useState(initialFields(operation.fields, sessionId));
  const [reading, setReading] = useState<z.output<typeof CODEX_PROVIDER_READ_QUERY> | null>(null);
  const control = useCodexControl(chatId);
  const record = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  const parsed =
    operation.kind === 'control'
      ? CODEX_PROVIDER_CONTROL.safeParse({ action: operation.id, ...record })
      : CODEX_PROVIDER_READ_QUERY.safeParse({ kind: operation.id, ...record });
  return (
    <View className="gap-4">
      <Text tone="variant">{operation.description}</Text>
      <OperationFields fields={operation.fields} values={fields} change={change} />
      <Button
        label={operation.kind === 'read' ? 'Read from computer' : operation.title}
        loading={control.isPending}
        disabled={!parsed.success}
        onPress={() => {
          if (operation.kind === 'read') {
            const query = CODEX_PROVIDER_READ_QUERY.parse({ kind: operation.id, ...record });
            setReading(query);
          } else control.mutate(CODEX_PROVIDER_CONTROL.parse({ action: operation.id, ...record }));
        }}
      />
      {control.data === undefined ? null : (
        <ProviderResult title="Acknowledged operation" value={control.data} />
      )}
      {control.error === null ? null : <Text tone="critical">{control.error.message}</Text>}
      {reading === null ? null : <ReadResult chatId={chatId} query={reading} />}
    </View>
  );
}
