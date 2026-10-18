import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { shellyOperation, type ShellyAction, type ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { SchemaEditor } from '../../components/schema-editor';
import type { Schema } from '../../components/schema-values';
import { Text } from '../../components/text';
import { editorSchema, inlineForm } from './action-schema';
import type { JsonRecord } from './form-model';
import { OperationFeedback } from './operation-feedback';
import { ParamFields } from './param-fields';
import { isDestructive } from './presence-operation';
import { ResultView } from './result-view';
import { usePresenceOperation } from './use-presence-operation';
import { background } from '@smarteverything/logging';

export interface ActionDraft {
  readonly value: JsonRecord;
  readonly change: (value: JsonRecord) => void;
}

export function useActionDraft(initial: JsonRecord = {}): ActionDraft {
  const [value, change] = useState<JsonRecord>(initial);
  return { value, change };
}

interface RunnerProps {
  readonly sensor: ShellyDevice;
  readonly action: ShellyAction;
  readonly draft: ActionDraft;
  readonly close: () => void;
  readonly fixed?: JsonRecord;
  readonly wrap?: string;
  readonly done?: (() => void) | undefined;
  readonly before?: ReactNode;
}

function Params({
  schema,
  draft,
}: {
  readonly schema: Schema;
  readonly draft: ActionDraft;
}): ReactNode {
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <View className="gap-3">
      {inlineForm(schema) ? (
        <ParamFields
          schema={schema}
          value={draft.value}
          change={draft.change}
          report={setFailure}
        />
      ) : (
        <SchemaEditor schema={schema} value={draft.value} change={draft.change} />
      )}
      {failure === null ? null : <Text tone="critical">{failure}</Text>}
    </View>
  );
}

export function ActionRunner({
  sensor,
  action,
  draft,
  close,
  fixed = {},
  wrap,
  done,
  before,
}: RunnerProps): ReactNode {
  const operation = usePresenceOperation(sensor);
  const { title } = shellyOperation(action);
  const schema = editorSchema(action, wrap, Object.keys(fixed));
  const run = (): void => {
    const params =
      wrap === undefined ? { ...fixed, ...draft.value } : { ...fixed, [wrap]: draft.value };
    background(
      operation.run({ action, params }).then((accepted) => {
        if (accepted) done?.();
      }),
      'operation.run_failed',
    );
  };
  return (
    <View className="gap-3">
      <Text variant="title-3">{title}</Text>
      {before}
      <Params schema={schema} draft={draft} />
      <OperationFeedback operation={operation} />
      <ResultView result={operation.result} run={operation.run} />
      <View className="flex-row gap-2">
        <Button
          label={title}
          variant={isDestructive(action) ? 'destructive' : 'filled'}
          loading={operation.busy}
          onPress={run}
        />
        <Button label="Back" variant="text" onPress={close} />
      </View>
    </View>
  );
}
