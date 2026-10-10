import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { humanizeEnum } from '@smarteverything/domain';
import { argumentValue, argumentsOf } from './run-action';

export function ActionSheet({
  presented,
  onClose,
  onRun,
}: {
  readonly presented: PresentedCapability;
  readonly onClose: () => void;
  readonly onRun: (value: JsonValue) => void;
}): ReactNode {
  const names = argumentsOf(presented);
  const [given, setGiven] = useState<Readonly<Record<string, string>>>({});
  const ready = names.every((name) => (given[name] ?? '').trim() !== '');
  const run = (): void => {
    if (!ready) {
      return;
    }
    onClose();
    onRun(Object.fromEntries(names.map((name) => [name, argumentValue(given[name] ?? '')])));
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={presented.label}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label={presented.label} disabled={!ready} onPress={run} />
        </>
      }
    >
      <View className="gap-4">
        {names.map((name, index) => (
          <TextField
            key={name}
            label={humanizeEnum(name)}
            value={given[name] ?? ''}
            onChange={(text) => {
              setGiven({ ...given, [name]: text });
            }}
            onSubmit={run}
            focusOnMount={index === 0}
          />
        ))}
      </View>
    </Sheet>
  );
}
