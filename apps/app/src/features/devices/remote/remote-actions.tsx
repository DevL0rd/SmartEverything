import type { ReactNode } from 'react';
import { View } from 'react-native';
import { buttonLabel, type IrRemoteState } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { WideClass } from '../card/wide-card';
import type { KeyControl, RemoteControlSet, StepControl } from './remote-controls';

type Press = (key: string) => void;

const UNKNOWN = '–';

export function stepText(step: StepControl, assumed: IrRemoteState): string | null {
  switch (step.id) {
    case 'temp':
      return assumed.temp === null ? UNKNOWN : `${String(assumed.temp)}°`;
    case 'speed':
      return assumed.speed === null ? UNKNOWN : String(assumed.speed);
    case 'volume':
      return null;
  }
}

function PowerKey({
  on,
  press,
  keyName,
}: {
  readonly on: boolean | null;
  readonly press: Press;
  readonly keyName: string;
}): ReactNode {
  return (
    <IconButton
      icon="power"
      label={`Press ${buttonLabel(keyName)}`}
      variant={on === true ? 'filled' : 'tonal'}
      onPress={() => {
        press(keyName);
      }}
    />
  );
}

function StepKeys({
  step,
  text,
  press,
}: {
  readonly step: StepControl;
  readonly text: string | null;
  readonly press: Press;
}): ReactNode {
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={step.label}
      className="flex-row items-center"
    >
      <IconButton
        icon="minus"
        label={`${step.label} down`}
        variant="tonal"
        onPress={() => {
          press(step.down);
        }}
      />
      {text === null ? (
        <View className="min-w-10 items-center">
          <Icon name="speaker" size={20} tone="variant" />
        </View>
      ) : (
        <Text variant="body-strong" align="center" numberOfLines={1} className="min-w-10 tabular">
          {text}
        </Text>
      )}
      <IconButton
        icon="plus"
        label={`${step.label} up`}
        variant="tonal"
        onPress={() => {
          press(step.up);
        }}
      />
    </View>
  );
}

function ModeMenu({
  modes,
  current,
  press,
}: {
  readonly modes: readonly string[];
  readonly current: string | null;
  readonly press: Press;
}): ReactNode {
  const items = modes.map((mode): MenuItem => ({
    label: buttonLabel(mode),
    icon: 'snowflake',
    onPress: (): void => {
      press(mode);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Mode');
  return (
    <View ref={ref} collapsable={false}>
      <Button label={current ?? 'Mode'} variant="text" icon="chevronDown" onPress={open} />
      {menu}
    </View>
  );
}

function KeyButton({
  control,
  press,
}: {
  readonly control: KeyControl;
  readonly press: Press;
}): ReactNode {
  const onPress = (): void => {
    press(control.key);
  };
  return control.icon === null ? (
    <Button label={control.label} variant="tonal" onPress={onPress} />
  ) : (
    <Button label={control.label} variant="tonal" icon={control.icon} onPress={onPress} />
  );
}

interface ActionsInput {
  readonly controls: RemoteControlSet;
  readonly assumed: IrRemoteState;
  readonly press: Press;
}

function secondaryOf({ controls, assumed, press }: ActionsInput): readonly ReactNode[] {
  const modes =
    controls.modes.length > 0
      ? [<ModeMenu key="modes" modes={controls.modes} current={assumed.mode} press={press} />]
      : [];
  return [
    ...modes,
    ...controls.keys.map((control) => (
      <KeyButton key={control.key} control={control} press={press} />
    )),
  ];
}

function primaryOf({ controls, assumed, press }: ActionsInput, on: boolean | null): ReactNode[] {
  const first: ReactNode[] = [];
  if (controls.power !== null) {
    first.push(<PowerKey key="power" on={on} press={press} keyName={controls.power} />);
  }
  if (controls.stepper !== null) {
    first.push(
      <StepKeys
        key="step"
        step={controls.stepper}
        text={stepText(controls.stepper, assumed)}
        press={press}
      />,
    );
  }
  return first;
}

const SECONDARY_SHOWN: Readonly<Record<WideClass, number>> = { m: 0, w: 1, l: 8, xl: 8 };

export function actionsOf(
  input: ActionsInput & { readonly on: boolean | null; readonly cls: WideClass },
): readonly ReactNode[] {
  const secondary = secondaryOf(input).slice(0, SECONDARY_SHOWN[input.cls]);
  const first = primaryOf(input, input.on);
  return secondary.length === 0
    ? first
    : [
        ...first,
        <View key="more" className="min-w-0 shrink flex-row flex-wrap items-center gap-x-1">
          {secondary}
        </View>,
      ];
}

export function quickActionsOf(input: ActionsInput & { readonly on: boolean | null }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {primaryOf(input, input.on)}
      {secondaryOf(input)}
    </View>
  );
}
