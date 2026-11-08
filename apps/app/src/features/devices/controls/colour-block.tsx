import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import {
  readPresentedColor,
  writePresentedColor,
  type PresentedCapability,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ColourPicker } from '../../../components/colour-picker';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { Control } from '../../../store/control';
import { background } from '@smarteverything/logging';

interface ColourProps {
  readonly presented: PresentedCapability;
  readonly control: Control;
  readonly disabled: boolean;
  readonly compact?: boolean;
}

function Picker({ presented, control, disabled }: ColourProps): ReactNode {
  return (
    <ColourPicker
      label={presented.label}
      value={readPresentedColor(presented, control.value)}
      disabled={disabled || control.offline}
      onChange={(colour) => {
        background(control.set(writePresentedColor(presented, colour)), 'control.set_failed');
      }}
      onCommit={(colour) => {
        background(control.set(writePresentedColor(presented, colour)), 'control.set_failed');
      }}
    />
  );
}

export function ColourBlock({
  presented,
  control,
  disabled,
  compact = false,
}: ColourProps): ReactNode {
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const close = (): void => {
    setOpen(false);
  };
  const picker = <Picker presented={presented} control={control} disabled={disabled} />;
  if (compact)
    return (
      <>
        <Button
          ref={opener}
          label={presented.label}
          icon="palette"
          variant="tonal"
          disabled={disabled || control.offline}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
        />
        <Sheet
          subpage={{ opener }}
          detents={['fit', 'full']}
          footer={<Button label="Done" onPress={close} />}
          open={open}
          onClose={close}
          title={presented.label}
        >
          {picker}
        </Sheet>
      </>
    );
  return (
    <View className="gap-3">
      <Text variant="body">{presented.label}</Text>
      {picker}
    </View>
  );
}
