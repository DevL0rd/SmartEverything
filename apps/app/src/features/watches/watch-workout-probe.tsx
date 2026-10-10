import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { probeWatchWorkout } from '../../../modules/health-connect';
import { Button } from '../../components/button';
import { NumberStepper } from '../../components/number-stepper';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { errorText } from '../../format/errors';

function ProbeControls({ deviceId }: { readonly deviceId: string }): ReactNode {
  const [sport, setSport] = useState(1);
  const [result, setResult] = useState('');
  const run = (on: boolean): void => {
    probeWatchWorkout(deviceId, sport, on).then(
      (outcome) => {
        setResult(outcome.detail);
      },
      (error: unknown) => {
        setResult(errorText(error).title);
      },
    );
  };
  return (
    <View className="gap-3 p-4">
      <NumberStepper
        label="Sport code"
        value={sport}
        min={1}
        max={999}
        step={1}
        onChange={setSport}
      />
      <View className="flex-row gap-2">
        <Button
          label="Start"
          onPress={() => {
            run(true);
          }}
        />
        <Button
          label="Finish"
          variant="text"
          onPress={() => {
            run(false);
          }}
        />
      </View>
      {result === '' ? null : (
        <Text variant="footnote" tone="variant">
          {result}
        </Text>
      )}
    </View>
  );
}

export function WatchWorkoutProbe({ deviceId }: { readonly deviceId: string }): ReactNode {
  if (!__DEV__ || Platform.OS !== 'android') {
    return null;
  }
  return (
    <List inset title="Workout probe (dev build only)">
      <ProbeControls deviceId={deviceId} />
    </List>
  );
}
