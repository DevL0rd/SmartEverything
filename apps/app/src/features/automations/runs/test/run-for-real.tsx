import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { confirm } from '../../../../components/confirm-store';
import { notifyFailure } from '../../../../components/toast-store';
import { Text } from '../../../../components/text';
import { REAL_RUN_WARNING } from './test-model';

export interface RunForRealProps {
  readonly name: string;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onRun: () => Promise<void>;
}

export function RunForReal({ name, disabled, loading, onRun }: RunForRealProps): ReactNode {
  return (
    <View className="gap-1">
      <Button
        label="Run for real"
        variant="destructive"
        disabled={disabled}
        loading={loading}
        hint={REAL_RUN_WARNING}
        onPress={() => {
          background(
            (async (): Promise<void> => {
              const accepted = await confirm({
                title: `Run ${name} for real?`,
                body: `${REAL_RUN_WARNING} It starts now, and commands already sent cannot be taken back.`,
                confirmLabel: 'Run for real',
                tone: 'destructive',
              });
              if (accepted) await onRun();
            })().catch(notifyFailure('The run could not be started.')),
            'automations.run_for_real',
          );
        }}
      />
      <Text variant="footnote" tone="critical">
        {REAL_RUN_WARNING}
      </Text>
    </View>
  );
}
