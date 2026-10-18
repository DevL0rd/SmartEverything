import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { type JsonValue, type ComputerAiNativeTool } from '@smarteverything/domain';
import { z } from 'zod';
import { Button } from '../../../components/button';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { SchemaEditor } from '../../../components/schema-editor';
import { StructuredValue } from '../../../components/structured-value';
import { rawErrorText } from '../../../format/errors';
import { useNativeToolCall } from '../data/native-tool';
import { NativeOperationFeedback } from './native-operation';
import { useNativeTools } from '../data/native-session';
import { QueryState } from './query-state';
import { background } from '@smarteverything/logging';

function ToolResult({ call }: { readonly call: ReturnType<typeof useNativeToolCall> }): ReactNode {
  return (
    <>
      {call.error === null || call.operation.receipt !== null ? null : (
        <Text tone="critical">{rawErrorText(call.error)}</Text>
      )}
      {call.operation.receipt === null && call.data !== undefined ? (
        <StructuredValue value={call.data} />
      ) : null}
      <NativeOperationFeedback operation={call.operation} />
    </>
  );
}

function ToolForm({
  deviceId,
  sessionId,
  tool,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly tool: ComputerAiNativeTool;
}): ReactNode {
  const [values, change] = useState<Readonly<Record<string, JsonValue>>>({});
  const body = z.fromJSONSchema(tool.input_schema ?? {}).safeParse(values);
  const call = useNativeToolCall(deviceId, sessionId, tool.name, values);
  const operation = call.operation;
  return (
    <View className="gap-3">
      <Text>{tool.description}</Text>
      <SchemaEditor schema={tool.input_schema ?? {}} value={values} change={change} />
      {body.success ? null : (
        <Text tone="variant">
          {body.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}
        </Text>
      )}
      <Button
        label="Run tool"
        loading={call.isPending}
        disabled={
          !body.success || tool.reason !== null || tool.input_schema === null || operation.blocked
        }
        onPress={() => {
          call.mutate(undefined);
        }}
      />
      <ToolResult call={call} />
    </View>
  );
}

export function NativeTools({
  deviceId,
  sessionId,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
}): ReactNode {
  const tools = useNativeTools(deviceId, sessionId);
  const [chosen, setChosen] = useState<ComputerAiNativeTool | null>(null);
  return (
    <>
      <QueryState
        error={tools.error}
        pending={tools.isPending}
        retry={() => {
          background(tools.refetch(), 'tools.refetch_failed');
        }}
      />
      <List title="Claude’s tools" footer="What you can do depends on this session.">
        {(tools.data ?? []).map((tool) => (
          <NavRow
            key={tool.name}
            title={tool.name}
            subtitle={tool.reason ?? tool.description}
            disabled={tool.reason !== null || tool.input_schema === null}
            onPress={() => {
              setChosen(tool);
            }}
          />
        ))}
      </List>
      <Sheet
        open={chosen !== null}
        title={chosen?.name ?? 'Tool'}
        onClose={() => {
          setChosen(null);
        }}
      >
        {chosen === null ? null : (
          <ToolForm key={chosen.name} deviceId={deviceId} sessionId={sessionId} tool={chosen} />
        )}
      </Sheet>
    </>
  );
}
