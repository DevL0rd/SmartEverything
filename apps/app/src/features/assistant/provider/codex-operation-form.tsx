import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  CODEX_PROVIDER_CONTROL,
  CODEX_PROVIDER_READ_QUERY,
  type JsonValue,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { OperationFieldInput } from './operation-fields';
import type { CodexOperation } from './codex-operations';
import { useCodexControl, useCodexRead } from './codex-provider-data';
import { ProviderResult } from './provider-result';
import { QueryState } from '../../computers/components/query-state';
import type { z } from 'zod';
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
          void read.refetch();
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
  const [fields, change] = useState<Readonly<Record<string, JsonValue | undefined>>>(
    Object.fromEntries(
      operation.fields.map((field) => [
        field.key,
        field.key === 'session_id' ? (sessionId ?? '') : field.initial,
      ]),
    ),
  );
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
      <Fields operation={operation} fields={fields} change={change} />
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

function Fields({
  operation,
  fields,
  change,
}: {
  readonly operation: CodexOperation;
  readonly fields: Readonly<Record<string, JsonValue | undefined>>;
  readonly change: (values: Readonly<Record<string, JsonValue | undefined>>) => void;
}): ReactNode {
  return (
    <>
      {operation.fields.map((field) => (
        <OperationFieldInput
          key={field.key}
          field={field}
          value={fields[field.key]}
          change={(value) => {
            change({ ...fields, [field.key]: value });
          }}
        />
      ))}
    </>
  );
}
