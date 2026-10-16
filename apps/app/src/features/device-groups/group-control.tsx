import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { CapabilityControl, ColourBlock } from '../devices';
import type { Device } from '../../store/state';
import type { Control } from '../../store/control';
import type { GroupControlChoice } from './model';
import { useGroupControl } from './use-group-control';

function PowerControl({ control }: { readonly control: Control }): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="callout" tone="variant">
        {control.value === undefined
          ? 'Mixed / unknown'
          : control.value === true
            ? 'All on'
            : 'All off'}
      </Text>
      <View className="flex-row gap-2">
        <Button
          label="On"
          variant="tonal"
          disabled={control.offline}
          onPress={() => {
            void control.set(true);
          }}
        />
        <Button
          label="Off"
          variant="tonal"
          disabled={control.offline}
          onPress={() => {
            void control.set(false);
          }}
        />
      </View>
    </View>
  );
}

function Body({
  control,
  choice,
}: {
  readonly control: Control;
  readonly choice: GroupControlChoice;
}): ReactNode {
  if (choice.presented.role === 'power') return <PowerControl control={control} />;
  if (
    choice.presented.colorEncoding !== undefined ||
    choice.presented.capability.value.kind === 'color'
  )
    return (
      <ColourBlock
        control={control}
        presented={choice.presented}
        disabled={control.offline}
        compact
      />
    );
  return (
    <CapabilityControl
      device={choice.device}
      presented={choice.presented}
      control={control}
      disabled={control.offline}
      continuous
      unknownValue="Mixed / unknown"
    />
  );
}

export function GroupControl({
  devices,
  choice,
}: {
  readonly devices: readonly Device[];
  readonly choice: GroupControlChoice;
}): ReactNode {
  const control = useGroupControl(devices, choice);
  return (
    <View className="gap-1">
      <Body control={control} choice={choice} />
      {choice.supported === devices.length ? null : (
        <Text
          variant="footnote"
          tone="variant"
        >{`${String(choice.supported)} of ${String(devices.length)} support ${choice.presented.label.toLowerCase()}`}</Text>
      )}
      {control.issues.map((issue) => (
        <Text key={issue} variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {issue}
        </Text>
      ))}
    </View>
  );
}
