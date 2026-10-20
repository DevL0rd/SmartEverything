import type { BottleFilterStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Rings } from '../../../components/charts';
import { confirm } from '../../../components/confirm-store';
import { Text } from '../../../components/text';
import { DAY_MS, shortDate } from '../../../format/time';
import { useBottleAct } from '../data/bottle-act';
import { filterRingsOf } from '../model/care-model';

const RING = 132;

function Used({ rings }: { readonly rings: ReturnType<typeof filterRingsOf> }): ReactNode {
  return (
    <View className="flex-row items-center gap-5">
      <Rings
        size={RING}
        rings={[
          { progress: rings.litres, colour: 'humidity', label: 'Litres filtered' },
          { progress: rings.days, colour: 'viz-2', label: 'Days in use' },
        ]}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout">{rings.litresText}</Text>
        <Text variant="callout">{rings.daysText}</Text>
        {rings.replaceBy === null ? null : (
          <Text variant="footnote" tone="variant">{`Replace by ${rings.replaceBy}`}</Text>
        )}
      </View>
    </View>
  );
}

function Installed({
  filter,
  deviceId,
}: {
  readonly filter: BottleFilterStatus;
  readonly deviceId: string;
}): ReactNode {
  const { act, busy } = useBottleAct(deviceId);
  const rings = filterRingsOf(filter);
  const reset = (): void => {
    background(
      confirm({
        title: 'Reset the filter?',
        body: `A new filter is counted from today and will be due by ${shortDate(Date.now() + filter.daysLimit * DAY_MS)}.`,
        confirmLabel: 'Reset filter',
      }).then((accepted) => {
        if (accepted) {
          act({ action: 'reset_filter' }, 'Could not reset the filter');
        }
      }),
      'bottle.filter_reset_failed',
    );
  };
  return (
    <>
      {rings.due ? (
        <Banner
          tone="warning"
          title="The filter is due"
          body="Fit a new one, then reset it here."
          wrapBody
        />
      ) : null}
      <Used rings={rings} />
      <View className="flex-row">
        <Button label="Reset filter" variant="tonal" loading={busy} onPress={reset} />
      </View>
    </>
  );
}

export function FilterCard({
  filter,
  deviceId,
}: {
  readonly filter: BottleFilterStatus | null;
  readonly deviceId: string;
}): ReactNode {
  const { act, busy } = useBottleAct(deviceId);
  return (
    <Card title="Filter" icon="filter">
      {filter === null ? (
        <View className="gap-2">
          <Text variant="callout" tone="variant">
            Using a filter pod? Add it to count its litres and days.
          </Text>
          <View className="flex-row">
            <Button
              label="I use a filter"
              variant="tonal"
              loading={busy}
              onPress={() => {
                act(
                  {
                    action: 'set_filter',
                    installed: true,
                    installedOn: new Date().toISOString().slice(0, 10),
                  },
                  'Could not add the filter',
                );
              }}
            />
          </View>
        </View>
      ) : (
        <Installed filter={filter} deviceId={deviceId} />
      )}
    </Card>
  );
}
