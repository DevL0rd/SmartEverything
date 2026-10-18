import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceTarget, GroupControlChoice } from '@smarteverything/domain';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { CapabilityControl, ColourBlock } from '../devices';
import type { Device } from '../../store/state';
import type { Control } from '../../store/control';
import { useGroupControl } from './use-group-control';
import { background } from '@smarteverything/logging';

function powerText(value: Control['value']): string {
  if (value === undefined) return 'Some on';
  return value === true ? 'All on' : 'All off';
}

function PowerControl({
  control,
  label,
}: {
  readonly control: Control;
  readonly label: string;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Text variant="body">{powerText(control.value)}</Text>
      <Switch
        label={label}
        value={control.value === true}
        mixed={control.value === undefined}
        disabled={control.offline}
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
    </View>
  );
}

function Body({
  control,
  choice,
}: {
  readonly control: Control;
  readonly choice: GroupControlChoice<Device>;
}): ReactNode {
  if (choice.presented.role === 'power')
    return <PowerControl control={control} label={choice.presented.label} />;
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
      unknownValue="Differs between lights"
    />
  );
}

export function GroupControl({
  target,
  members,
  choice,
}: {
  readonly target: DeviceTarget;
  readonly members: readonly Device[];
  readonly choice: GroupControlChoice<Device>;
}): ReactNode {
  const control = useGroupControl(target, members, choice);
  return (
    <View className="gap-1">
      <Body control={control} choice={choice} />
      {choice.supported === members.length ? null : (
        <Text
          variant="footnote"
          tone="variant"
        >{`${String(choice.supported)} of ${String(members.length)} support ${choice.presented.label.toLowerCase()}`}</Text>
      )}
      {control.issues.map((issue) => (
        <Text key={issue} variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {issue}
        </Text>
      ))}
    </View>
  );
}
