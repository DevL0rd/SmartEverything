import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import type { Runner } from './use-runner';
import type { Laundry } from './use-laundry';
import { useLedger } from '../../../store/store-context';
import { background } from '@smarteverything/logging';

function adviceSteps(advice: string): readonly string[] {
  return advice.split(/(?<=\.)\s+/).filter((step) => step !== '');
}

interface AdviceProps {
  readonly laundry: Laundry;
  readonly runner: Runner;
  readonly onClose: () => void;
}

function AdviceButtons({ laundry, runner, onClose }: AdviceProps): ReactNode {
  const ledger = useLedger();
  const { fault, underlying } = laundry.state;
  const inCycle = underlying !== 'idle' && underlying !== 'off';
  const resumeKey = laundry.keyOf('cycle_start');
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="I fixed it"
        onPress={() => {
          onClose();
          if (inCycle && resumeKey !== undefined) {
            background(ledger.send(laundry.device, resumeKey, null), 'laundry.resume_failed');
          }
        }}
      />
      {inCycle ? (
        <Button
          label="Stop the cycle"
          variant="outlined"
          onPress={() => {
            onClose();
            runner.run('stop');
          }}
        />
      ) : null}
      <Button
        label="Contact service"
        variant="tonal"
        onPress={() => {
          notify({
            message: 'Service contact',
            detail: `Quote code E${String(fault?.code ?? 0)} and model ${laundry.device.model}.`,
          });
        }}
      />
    </View>
  );
}

export function AdviceSheet(props: AdviceProps): ReactNode {
  const { fault } = props.laundry.state;
  if (fault === null) {
    return null;
  }
  return (
    <Sheet
      open
      title={`${fault.title} (E${String(fault.code)})`}
      detents={['fit']}
      onClose={props.onClose}
    >
      <View className="gap-4 pb-2">
        <View className="gap-1.5">
          {adviceSteps(fault.advice).map((step, index) => (
            <Text key={step} variant="body">{`${String(index + 1)}. ${step}`}</Text>
          ))}
        </View>
        <Text variant="footnote" tone="variant">
          The machine unlocks the door when it is safe.
        </Text>
        <AdviceButtons {...props} />
      </View>
    </Sheet>
  );
}
