import { Logger } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { probeWatchWorkout } from '../../../../modules/health-connect';
import { Button } from '../../../components/button';
import { NumberStepper } from '../../../components/number-stepper';
import { Text } from '../../../components/text';
import { errorFields } from '../../../design/log-tally';
import { errorText } from '../../../format/errors';
import { useMyWatch } from '../../watches';

const log = new Logger('app.developer');

function runProbe(watchId: string, sport: number, on: boolean, show: (text: string) => void): void {
  const fields = { watchId, sport, on };
  log.debug('watch_workout_probe.started', fields);
  probeWatchWorkout(watchId, sport, on).then(
    (outcome) => {
      log.info('watch_workout_probe.finished', fields);
      show(outcome.detail);
    },
    (error: unknown) => {
      log.warn('watch_workout_probe.failed', { ...fields, ...errorFields(error) });
      show(errorText(error).title);
    },
  );
}

export function WatchWorkoutProbe(): ReactNode {
  const watch = useMyWatch();
  const [sport, setSport] = useState(1);
  const [result, setResult] = useState('');
  if (watch === null) {
    return null;
  }
  const run = (on: boolean): void => {
    runProbe(watch.id, sport, on, setResult);
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
