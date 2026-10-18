import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type {
  AutomationRunRow,
  AutomationV2,
  InputDeclarationV2,
  JsonValue,
} from '@smarteverything/domain';
import { testAutomation } from '../../../api/automations';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { attempt } from '../data/actions';
import { defaultLiteral } from '../model/inputs';
import { LiteralField } from '../editor/literal-field';
import { background } from '@smarteverything/logging';

interface Props {
  readonly automationId: string | null;
  readonly definition: AutomationV2;
  readonly name: string;
  readonly inputs: readonly InputDeclarationV2[];
  readonly catalog: Catalog;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRun: (run: AutomationRunRow) => void;
}

function startTest(input: {
  readonly automationId: string | null;
  readonly definition: Props['definition'];
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly onRun: Props['onRun'];
  readonly onDone: () => void;
}): void {
  const { automationId, definition, values, onRun, onDone } = input;
  background(
    attempt(
      'The test didn’t start',
      async () => {
        onRun(await testAutomation(automationId, definition, values));
      },
      { action: 'test-with-inputs', automationId, inputs: Object.keys(values).length },
    ).finally(onDone),
    'test_inputs_sheet.attempt_failed',
  );
}

function Values({
  automationId,
  definition,
  inputs,
  catalog,
  onRun,
}: Omit<Props, 'open' | 'onClose' | 'name'>): ReactNode {
  const [values, setValues] = useState<Readonly<Record<string, JsonValue>>>(() =>
    Object.fromEntries(inputs.map((input) => [input.name, defaultLiteral(input.type)])),
  );
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Runs this draft now with these values.
      </Text>
      {inputs.map((input) => (
        <LiteralField
          key={input.name}
          catalog={catalog}
          shape={{ type: 'kind', kind: input.type }}
          label={input.name}
          value={values[input.name] ?? defaultLiteral(input.type)}
          onChange={(value) => {
            setValues({ ...values, [input.name]: value });
          }}
        />
      ))}
      <Button
        label="Start test"
        icon="play"
        loading={busy}
        onPress={() => {
          setBusy(true);
          startTest({
            automationId,
            definition,
            values,
            onRun,
            onDone: () => {
              setBusy(false);
            },
          });
        }}
      />
    </View>
  );
}

export function TestInputsSheet({ name, open, onClose, ...rest }: Props): ReactNode {
  return (
    <Sheet open={open} title={`Test ${name}`} detents={['full']} onClose={onClose}>
      <Values key={rest.automationId ?? 'new'} {...rest} />
    </Sheet>
  );
}
