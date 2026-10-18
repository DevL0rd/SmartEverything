import type { ReactNode } from 'react';
import { PHONE_RINGER_MODES } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { z } from 'zod';
import { Card } from '../../../components/card';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { SwitchTrack } from '../../../components/switch';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { selectionTick } from '../../../platform/haptics';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import type { PhoneAccess } from '../model/face-model';
import type { PhoneReadings } from '../phone-values';
import { NeedLine } from '../screens/detail-parts';

const RINGER = z.enum(PHONE_RINGER_MODES);

type RingerMode = z.infer<typeof RINGER>;

const NEEDS_ACCESS = 'Allow Do Not Disturb access on the phone to use Silent and Do Not Disturb';

const OPTIONS: readonly SegmentedOption<RingerMode>[] = [
  { value: 'normal', label: 'Normal', icon: 'bell' },
  { value: 'vibrate', label: 'Vibrate', icon: 'smartphone' },
  { value: 'silent', label: 'Silent', icon: 'bellOff' },
];

function optionsFor(blocked: boolean): readonly SegmentedOption<RingerMode>[] {
  return blocked ? OPTIONS.filter((option) => option.value !== 'silent') : OPTIONS;
}

function RingerRow({
  device,
  mode,
  disabled,
  blocked,
}: {
  readonly device: Device;
  readonly mode: PhoneReadings['ringerMode'];
  readonly disabled: boolean;
  readonly blocked: boolean;
}): ReactNode {
  const control = useControl(device.id, 'ringer_mode');
  const requested = RINGER.safeParse(control.pending ? control.value : mode);
  return (
    <Segmented
      label="Ringer"
      options={optionsFor(blocked)}
      value={requested.success ? requested.data : 'normal'}
      disabled={disabled}
      onChange={(next) => {
        background(control.set(next), 'phone.ringer_failed');
      }}
    />
  );
}

function DndRow({
  device,
  on,
  disabled,
}: {
  readonly device: Device;
  readonly on: boolean;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, 'dnd');
  const shown = control.pending && typeof control.value === 'boolean' ? control.value : on;
  return (
    <Interactive
      role="switch"
      label="Do not disturb"
      checked={shown}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        background(control.set(!shown), 'phone.dnd_failed');
      }}
      className="min-h-touch-min flex-row items-center gap-3"
    >
      <Text variant="body" className="flex-1">
        Do not disturb
      </Text>
      <SwitchTrack value={shown} />
    </Interactive>
  );
}

export function ModeCard({
  device,
  readings,
  access,
}: {
  readonly device: Device;
  readonly readings: Pick<PhoneReadings, 'ringerMode' | 'dnd'>;
  readonly access: PhoneAccess;
}): ReactNode {
  const blocked = access.dnd === 'needs_permission';
  const disabled = !access.view.canAct;
  return (
    <Card title="Mode" icon="bell">
      <RingerRow device={device} mode={readings.ringerMode} disabled={disabled} blocked={blocked} />
      <DndRow device={device} on={readings.dnd === true} disabled={disabled || blocked} />
      {blocked ? <NeedLine text={NEEDS_ACCESS} /> : null}
    </Card>
  );
}
