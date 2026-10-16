import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  checkedBindingValue,
  type AutomationRunRow,
  type AutomationSequenceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { startSequence } from '../../../api/automation-runtime';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { attempt } from '../data/actions';
import { TypedLiteral, literalValue } from '../editor/binding-fields';

interface ParameterValuesProps {
  readonly row: AutomationSequenceRow;
  readonly catalog: Catalog;
  readonly onRun: (run: AutomationRunRow) => void;
}

function ParameterValues({ row, catalog, onRun }: ParameterValuesProps): ReactNode {
  const [parameters, setParameters] = useState<Record<string, JsonValue>>(() =>
    Object.fromEntries(
      row.definition.parameters.map((parameter) => [parameter.name, literalValue(parameter.kind)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Starts this saved sequence now under its run policy.
      </Text>
      {row.definition.parameters.map((parameter) => (
        <View key={parameter.name} className="gap-2">
          <Text variant="body-strong">{parameter.name}</Text>
          <TypedLiteral
            kind={parameter.kind}
            catalog={catalog}
            value={parameters[parameter.name] ?? literalValue(parameter.kind)}
            onChange={(value) => {
              setParameters({ ...parameters, [parameter.name]: value });
            }}
          />
        </View>
      ))}
      <Button
        label="Start test"
        icon="play"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void attempt('The sequence didn’t start', async () => {
            const values = Object.fromEntries(
              row.definition.parameters.map((parameter) => {
                const value = parameters[parameter.name];
                if (value === undefined) throw new Error(`Enter a value for ${parameter.name}.`);
                return [parameter.name, checkedBindingValue(parameter.kind, value)];
              }),
            );
            onRun(await startSequence(row.id, values));
          }).finally(() => {
            setBusy(false);
          });
        }}
      />
    </View>
  );
}

interface SequenceTestProps {
  readonly row: AutomationSequenceRow;
  readonly catalog: Catalog;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRun: (run: AutomationRunRow) => void;
}

export function SequenceTest({ row, catalog, open, onClose, onRun }: SequenceTestProps): ReactNode {
  return (
    <Sheet open={open} title={`Test ${row.name}`} detents={['full']} onClose={onClose}>
      <ParameterValues
        key={`${row.id}:${row.revision}`}
        row={row}
        catalog={catalog}
        onRun={onRun}
      />
    </Sheet>
  );
}
