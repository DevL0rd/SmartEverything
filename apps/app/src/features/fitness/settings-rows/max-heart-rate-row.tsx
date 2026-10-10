import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { MAX_HEART_RATE_LIMITS } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useEntityStore } from '../../../store/store-context';
import { useMaxHeartRateSetting } from '../data/goals';
import { useBestDay } from '../data/queries';
import { writeFitnessSettings } from '../data/settings-write';
import { maxHeartRateFromData } from '../model/goals';

const STANDARD_MAX = 190;

function useSave(): (value: number | null) => void {
  const store = useEntityStore();
  return (value) => {
    writeFitnessSettings(store, { maxHeartRate: value }).catch((error: unknown) => {
      notify({
        message: 'Maximum heart rate was not changed',
        error,
        tone: 'critical',
      });
    });
  };
}

function Editor({
  setting,
  highest,
  save,
}: {
  readonly setting: number | null;
  readonly highest: number | null;
  readonly save: (value: number | null) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Used to work out heart rate zones.
      </Text>
      <NumberStepper
        label="Maximum heart rate"
        value={setting ?? highest ?? STANDARD_MAX}
        min={MAX_HEART_RATE_LIMITS.min}
        max={MAX_HEART_RATE_LIMITS.max}
        step={MAX_HEART_RATE_LIMITS.step}
        unit="bpm"
        onChange={save}
      />
      <View className="flex-row flex-wrap gap-2">
        {highest === null ? null : (
          <Button
            label={`Use highest in my data (${String(highest)})`}
            variant="tonal"
            onPress={() => {
              save(highest);
            }}
          />
        )}
        {setting === null ? null : (
          <Button
            label="Work it out for me"
            variant="text"
            onPress={() => {
              save(null);
            }}
          />
        )}
      </View>
    </View>
  );
}

export function MaxHeartRateRow(): ReactNode {
  const setting = useMaxHeartRateSetting();
  const best = useBestDay('heart_rate_maximum', false).data;
  const highest = best === undefined || best === null ? null : maxHeartRateFromData([best.value]);
  const save = useSave();
  const [open, setOpen] = useState(false);
  const value =
    setting !== null
      ? `${String(setting)} bpm`
      : highest === null
        ? 'Not set'
        : `${String(highest)} bpm · auto`;
  return (
    <>
      <ListRow
        icon="heartPulse"
        title="Max heart rate"
        value={value}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Max heart rate"
        detents={['fit']}
      >
        <Editor setting={setting} highest={highest} save={save} />
      </Sheet>
    </>
  );
}
