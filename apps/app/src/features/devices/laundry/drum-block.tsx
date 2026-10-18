import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { useEntityStore, useLedger } from '../../../store/store-context';
import { Block } from './block';
import { stepsOf } from './draft';
import { drumCleanText, type DrumClean } from './maintenance-model';
import { sendPlan } from './send-plan';
import type { Laundry } from './use-laundry';

const DRUM_CLEAN = 'Drum Clean';

export function DrumBlock({
  laundry,
  clean,
}: {
  readonly laundry: Laundry;
  readonly clean: DrumClean;
}): ReactNode {
  const ledger = useLedger();
  const store = useEntityStore();
  const [running, setRunning] = useState(false);
  const run = async (): Promise<void> => {
    const accepted = await confirm({
      title: 'Run drum clean?',
      body: 'Take the laundry out first. The cycle takes about 1 h 15 min.',
      confirmLabel: 'Run drum clean',
    });
    if (accepted) {
      const steps = stepsOf(laundry, { program: DRUM_CLEAN, delay: null });
      await sendPlan({ device: laundry.device, ledger, store }, steps);
    }
  };
  return (
    <Block
      icon="refresh"
      tone={clean.due ? 'warning' : 'variant'}
      title="Clean the drum"
      sub={drumCleanText(clean)}
    >
      <View className="flex-row">
        <Button
          label="Run drum clean"
          variant="tonal"
          loading={running}
          disabled={!laundry.state.startable}
          onPress={() => {
            setRunning(true);
            background(
              run().finally(() => {
                setRunning(false);
              }),
              'laundry.drum_clean_failed',
            );
          }}
        />
      </View>
    </Block>
  );
}
