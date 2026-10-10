import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import type { IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { buttonLabel, remoteKeysOf, remoteLayout, type PadDirection } from '../model/remote-layout';

const PAD_ICON: Readonly<Record<Exclude<PadDirection, 'ok'>, IconName>> = {
  up: 'chevronUp',
  down: 'chevronDown',
  left: 'chevronLeft',
  right: 'chevronRight',
};

function PadKey({
  option,
  direction,
  press,
}: {
  readonly option: string | undefined;
  readonly direction: PadDirection;
  readonly press: (option: string) => void;
}): ReactNode {
  if (option === undefined) {
    return <View className="size-14" />;
  }
  if (direction === 'ok') {
    return (
      <Interactive
        label={buttonLabel(option)}
        onPress={() => {
          press(option);
        }}
        className="size-16 items-center justify-center rounded-full bg-surface-3"
        layerClassName="rounded-full"
      >
        <Text variant="label">OK</Text>
      </Interactive>
    );
  }
  return (
    <View className="size-14 items-center justify-center">
      <IconButton
        icon={PAD_ICON[direction]}
        label={buttonLabel(option)}
        onPress={() => {
          press(option);
        }}
      />
    </View>
  );
}

export function RemotePad({ device }: { readonly device: Device }): ReactNode {
  const control = useControl(device.id, 'remote_key');
  const layout = remoteLayout(remoteKeysOf(device.capabilities));
  const press = (option: string): void => {
    void control.set(option);
  };
  const hasPad = Object.keys(layout.pad).length > 0;
  if (!hasPad && layout.rest.length === 0) {
    return null;
  }
  return (
    <View className="items-center gap-6">
      {hasPad ? (
        <View className="size-52 items-center justify-center rounded-full bg-surface-2">
          <PadKey option={layout.pad.up} direction="up" press={press} />
          <View className="flex-row items-center">
            <PadKey option={layout.pad.left} direction="left" press={press} />
            <PadKey option={layout.pad.ok} direction="ok" press={press} />
            <PadKey option={layout.pad.right} direction="right" press={press} />
          </View>
          <PadKey option={layout.pad.down} direction="down" press={press} />
        </View>
      ) : null}
      <View
        accessibilityRole="toolbar"
        accessibilityLabel="Remote buttons"
        className="w-full flex-row flex-wrap justify-center gap-2"
      >
        {layout.rest.map((option) => (
          <Button
            key={option}
            label={buttonLabel(option)}
            variant="tonal"
            onPress={() => {
              press(option);
            }}
          />
        ))}
      </View>
    </View>
  );
}
