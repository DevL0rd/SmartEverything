import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import type { WorldCity } from './cities';
import { DAY_HOURS, hourTimeOf, hourShiftedBy, type HomeDay, type HourPlan } from './find-a-time';
import { HourGrid, type HourPick } from './hour-grid';

export interface FindATimeProps {
  readonly cities: readonly WorldCity[];
  readonly home: HomeDay;
  readonly plan: HourPlan;
  readonly pick: HourPick;
  readonly disabled: boolean;
  readonly onCreate: () => void;
}

function Pill({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="min-w-0 shrink rounded-full bg-surface-3 px-3 py-1">
      <Text variant="caption" className="tabular" numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function CreateButton({
  time,
  disabled,
  onCreate,
}: Pick<FindATimeProps, 'disabled' | 'onCreate'> & { readonly time: string }): ReactNode {
  return (
    <Button
      label={`Create event at ${time}`}
      icon="calendar"
      variant="tonal"
      disabled={disabled}
      onPress={onCreate}
    />
  );
}

function HourSteps({ pick }: { readonly pick: HourPick }): ReactNode {
  return (
    <View className="flex-row gap-1">
      <IconButton
        icon="arrowLeft"
        label="An hour earlier"
        disabled={pick.hour === 0}
        onPress={() => {
          pick.onHour(hourShiftedBy(pick.hour, -1));
        }}
      />
      <IconButton
        icon="arrowRight"
        label="An hour later"
        disabled={pick.hour === DAY_HOURS - 1}
        onPress={() => {
          pick.onHour(hourShiftedBy(pick.hour, 1));
        }}
      />
    </View>
  );
}

export function FindATimeCard(props: FindATimeProps): ReactNode {
  const { pick } = props;
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-48 flex-1">
          <Text variant="label">Find a time</Text>
          <Text variant="caption" tone="variant">
            Working hours are tinted, night is dim. Drag the marker.
          </Text>
        </View>
        <Pill text={pick.summary} />
        <HourSteps pick={pick} />
        <CreateButton
          time={hourTimeOf(pick.hour, props.home)}
          disabled={props.disabled}
          onCreate={props.onCreate}
        />
      </View>
      <HourGrid
        cities={props.cities}
        home={props.home}
        plan={props.plan}
        pick={pick}
        slim={false}
      />
    </Card>
  );
}

export function FindATimePhone(props: FindATimeProps): ReactNode {
  const { pick, home } = props;
  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="label">Find a time</Text>
        <Pill text={`${hourTimeOf(pick.hour, home)} here`} />
      </View>
      <HourGrid cities={props.cities} home={home} plan={props.plan} pick={pick} slim />
      <Slider
        value={pick.hour}
        min={0}
        max={DAY_HOURS - 1}
        step={1}
        label="Time at home"
        formatValue={(hour) => hourTimeOf(hour, home)}
        onChange={pick.onHour}
        onCommit={pick.onHour}
      />
      <View className="items-start">
        <CreateButton
          time={hourTimeOf(pick.hour, props.home)}
          disabled={props.disabled}
          onCreate={props.onCreate}
        />
      </View>
    </Card>
  );
}
