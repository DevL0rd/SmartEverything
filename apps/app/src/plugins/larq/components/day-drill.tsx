import type { BottleStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { millilitres } from '../../../format/number';
import { shiftDay } from '../../../format/time';
import { useBottleView } from '../data/bottle-data';
import { dayHeading } from '../model/calendar-model';
import { DrinkRows } from './drink-rows';

interface DayDrillProps {
  readonly deviceId: string;
  readonly heatmap: BottleStats['heatmap'];
  readonly day: string | null;
  readonly onDay: (day: string | null) => void;
}

function Drinks({ deviceId, day }: { readonly deviceId: string; readonly day: string }): ReactNode {
  const drinks = useBottleView(deviceId, 'drinks', { day });
  return (
    <LoadedQuery query={drinks}>
      {(view) =>
        view.drinks.length === 0 ? (
          <Text variant="callout" tone="variant">
            Nothing from the bottle on this day.
          </Text>
        ) : (
          <DrinkRows drinks={view.drinks} />
        )
      }
    </LoadedQuery>
  );
}

function Body({
  deviceId,
  heatmap,
  day,
  onDay,
}: DayDrillProps & { readonly day: string }): ReactNode {
  const entry = heatmap.find((item) => item.day === day);
  const first = heatmap[0]?.day ?? day;
  const last = heatmap.at(-1)?.day ?? day;
  return (
    <View className="gap-3 pb-4">
      <View className="flex-row items-center justify-between gap-3">
        <Button
          label="Earlier"
          icon="chevronLeft"
          variant="text"
          disabled={day <= first}
          onPress={() => {
            onDay(shiftDay(day, -1));
          }}
        />
        <Text variant="body-strong">{dayHeading(day)}</Text>
        <Button
          label="Later"
          icon="chevronRight"
          variant="text"
          disabled={day >= last}
          onPress={() => {
            onDay(shiftDay(day, 1));
          }}
        />
      </View>
      {entry === undefined ? null : (
        <Text variant="callout" tone="variant">
          {`${millilitres(Math.round(entry.ml))} of ${millilitres(Math.round(entry.goalMl))} from every source`}
        </Text>
      )}
      <Drinks deviceId={deviceId} day={day} />
    </View>
  );
}

export function DayDrill(props: DayDrillProps): ReactNode {
  const { day, onDay } = props;
  return (
    <BottomSheet
      open={day !== null}
      onClose={() => {
        onDay(null);
      }}
      title="Day"
      label="Drinks on one day"
      detents={['half', 'full']}
      scroll
    >
      {day === null ? null : <Body {...props} day={day} />}
    </BottomSheet>
  );
}
