import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  PROVIDER_CONTROL,
  PROVIDER_READ_QUERY,
  type ProviderReadQuery,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { QueryState } from '../../computers';
import { OperationFields, initialFields } from './operation-fields';
import { useProviderControl, useProviderRead } from './provider-data';
import { ProviderResult } from './provider-result';
import type { ProviderOperation } from './provider-operations';
import { background } from '@smarteverything/logging';

function ReadResult({
  chatId,
  query,
}: {
  readonly chatId: string;
  readonly query: ProviderReadQuery;
}): ReactNode {
  const read = useProviderRead(chatId, query, true);
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

export function OperationForm({
  chatId,
  operation,
  sessionId,
}: {
  readonly chatId: string;
  readonly operation: ProviderOperation;
  readonly sessionId: string | null;
}): ReactNode {
  const [fields, setFields] = useState(initialFields(operation.fields, sessionId));
  const [reading, setReading] = useState<ProviderReadQuery | null>(null);
  const control = useProviderControl(chatId);
  const record = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  const parsed =
    operation.kind === 'control'
      ? PROVIDER_CONTROL.safeParse({ action: operation.id, ...record })
      : PROVIDER_READ_QUERY.safeParse({ kind: operation.id, ...record });
  return (
    <View className="gap-4">
      <Text tone="variant">{operation.description}</Text>
      <OperationFields fields={operation.fields} values={fields} change={setFields} />
      <Button
        label={operation.kind === 'read' ? 'Read from provider' : 'Apply to provider'}
        loading={control.isPending}
        disabled={!parsed.success}
        onPress={() => {
          if (operation.kind === 'control') {
            const body = PROVIDER_CONTROL.parse({ action: operation.id, ...record });
            control.mutate(body);
          } else setReading(PROVIDER_READ_QUERY.parse({ kind: operation.id, ...record }));
        }}
      />
      {parsed.success ? null : (
        <Text tone="variant">
          {parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('\n')}
        </Text>
      )}
      {control.data === undefined ? null : <ProviderResult value={control.data} />}
      {reading === null ? null : <ReadResult chatId={chatId} query={reading} />}
    </View>
  );
}
