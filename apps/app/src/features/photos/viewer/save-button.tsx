import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { Button, type ButtonProps } from '../../../components/button';
import { SAVE_LABEL } from '../library/save-target';
import { saveToDevice } from '../library/save-to-device';

export function SaveToDeviceButton({
  itemId,
  variant,
}: {
  readonly itemId: string;
  readonly variant: NonNullable<ButtonProps['variant']>;
}): ReactNode {
  return (
    <Button
      label={SAVE_LABEL}
      icon="download"
      variant={variant}
      onPress={() => {
        background(saveToDevice([itemId]), 'photos.save_to_device_failed');
      }}
    />
  );
}
