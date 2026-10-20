import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { NeedLine } from '../screens/detail-parts';
import { TIMEOUT_OPTIONS, foldText, timeoutValueOf, type ScreenSection } from './screen-model';

export function TimeoutCard({
  device,
  screen,
  canAct,
}: {
  readonly device: Device;
  readonly screen: ScreenSection;
  readonly canAct: boolean;
}): ReactNode {
  const control = useControl(device.id, 'screen_timeout');
  const shown =
    control.pending && typeof control.value === 'string'
      ? control.value
      : timeoutValueOf(screen.timeoutSeconds);
  const fold = foldText(screen.fold);
  return (
    <Card
      title="Screen timeout"
      icon="timer"
      action={
        fold === null ? undefined : <Badge label={`Fold: ${fold.toLowerCase()}`} icon="maximize" />
      }
    >
      <Segmented
        label="Screen timeout"
        options={TIMEOUT_OPTIONS}
        value={shown}
        disabled={!canAct || !screen.writable}
        onChange={(value) => {
          background(control.set(value), 'phone.screen_timeout_failed');
        }}
      />
      {screen.writable ? null : (
        <NeedLine text="Allow Modify system settings on the phone to change the screen timeout here" />
      )}
    </Card>
  );
}
