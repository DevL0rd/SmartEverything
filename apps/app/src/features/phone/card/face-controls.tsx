import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { PHONE_RINGER_MODES, type JsonValue } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { z } from 'zod';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { useControl } from '../../../store/control';
import { useRow } from '../../../store/selectors';
import { useLedger } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import type { FaceReadings, PhoneAccess } from '../model/face-model';

const RINGER = z.enum(PHONE_RINGER_MODES);
const SLIDER_MAX = 100;
const NEEDS_ACCESS = 'Needs Do Not Disturb access';

type RingerMode = z.infer<typeof RINGER>;

type RingerChoice = RingerMode | 'dnd';

const RINGER_TEXT: Readonly<Record<RingerChoice, string>> = {
  normal: 'Normal',
  vibrate: 'Vibrate',
  silent: 'Silent',
  dnd: 'Do not disturb',
};

const RINGER_ICON: Readonly<Record<RingerChoice, IconName>> = {
  normal: 'bell',
  vibrate: 'smartphone',
  silent: 'bellOff',
  dnd: 'moon',
};

export type Layout = 'm' | 'w' | 'l';

export function useDeviceCommand(device: Device): (capability: string, value: JsonValue) => void {
  const ledger = useLedger();
  return (capability, value) => {
    background(ledger.send(device, capability, value), 'phone.command_failed');
  };
}

function offers(device: Device, capability: string): boolean {
  return device.capabilities.some((entry) => entry.key === capability);
}

export function RingButton({
  device,
  ringing,
  compact,
}: {
  readonly device: Device;
  readonly ringing: boolean;
  readonly compact: boolean;
}): ReactNode {
  const stoppable = ringing && offers(device, 'stop_ring');
  const control = useControl(device.id, stoppable ? 'stop_ring' : 'ring');
  const label = stoppable ? (compact ? 'Stop' : 'Stop ringing') : 'Ring';
  return (
    <Button
      label={label}
      icon="siren"
      variant={ringing ? 'filled' : 'tonal'}
      loading={control.pending}
      onPress={() => {
        background(control.set(null), 'phone.ring_failed');
      }}
    />
  );
}

export function TorchButton({
  device,
  on,
}: {
  readonly device: Device;
  readonly on: boolean;
}): ReactNode {
  const torch = useControl(device.id, 'flashlight');
  const shown = torch.pending ? torch.value === 'on' : on;
  return (
    <IconButton
      icon="flashlight"
      label={shown ? 'Flashlight on, turn off' : 'Flashlight off, turn on'}
      variant={shown ? 'filled' : 'tonal'}
      selected={shown}
      onPress={() => {
        background(torch.set(shown ? 'off' : 'on'), 'phone.flashlight_failed');
      }}
    />
  );
}

function choiceOf(
  dnd: boolean,
  ringerMode: FaceReadings['ringerMode'],
  requested: JsonValue | undefined,
): RingerChoice | null {
  if (dnd) return 'dnd';
  const mode = RINGER.safeParse(requested ?? ringerMode);
  return mode.success ? mode.data : null;
}

function descriptionOf(blocked: boolean, current: boolean): { readonly description?: string } {
  if (blocked) return { description: NEEDS_ACCESS };
  return current ? { description: 'Current' } : {};
}

function ringerItems(
  current: RingerChoice | null,
  needsAccess: boolean,
  send: (capability: string, value: JsonValue) => void,
): readonly MenuItem[] {
  const choices: readonly RingerChoice[] = ['normal', 'vibrate', 'silent', 'dnd'];
  return choices.map((choice) => {
    const blocked = needsAccess && (choice === 'silent' || choice === 'dnd');
    return {
      label: RINGER_TEXT[choice],
      icon: RINGER_ICON[choice],
      ...descriptionOf(blocked, choice === current),
      disabled: blocked,
      onPress: (): void => {
        if (choice === 'dnd') send('dnd', current !== 'dnd');
        else send('ringer_mode', choice);
      },
    };
  });
}

export function RingerMenu({
  device,
  ringerMode,
  dnd,
  access,
  compact,
}: {
  readonly device: Device;
  readonly ringerMode: FaceReadings['ringerMode'];
  readonly dnd: boolean;
  readonly access: PhoneAccess;
  readonly compact: boolean;
}): ReactNode {
  const ringer = useControl(device.id, 'ringer_mode');
  const send = useDeviceCommand(device);
  const current = choiceOf(dnd, ringerMode, ringer.pending ? ringer.value : undefined);
  const { ref, open, menu } = useAnchoredMenu(
    ringerItems(current, access.dnd === 'needs_permission', send),
    'Ringer',
  );
  const word = current === null ? 'Ringer' : RINGER_TEXT[current];
  const icon = current === null ? 'bell' : RINGER_ICON[current];
  return (
    <View ref={ref} collapsable={false}>
      {compact ? (
        <IconButton
          icon={icon}
          label={`Ringer, ${word}`}
          variant={current === 'dnd' ? 'tonal' : 'standard'}
          onPress={open}
        />
      ) : (
        <Button label={word} icon={icon} variant="tonal" loading={ringer.pending} onPress={open} />
      )}
      {menu}
    </View>
  );
}

const SEGMENTS: readonly SegmentedOption<RingerMode>[] = [
  { value: 'normal', label: 'Normal', icon: 'bell' },
  { value: 'vibrate', label: 'Vibrate', icon: 'smartphone' },
  { value: 'silent', label: 'Silent', icon: 'bellOff' },
];

export function RingerSegmented({
  device,
  ringerMode,
  dnd,
}: {
  readonly device: Device;
  readonly ringerMode: FaceReadings['ringerMode'];
  readonly dnd: boolean;
}): ReactNode {
  const send = useDeviceCommand(device);
  const mode = dnd ? null : RINGER.safeParse(ringerMode);
  return (
    <Segmented
      label="Ringer"
      options={SEGMENTS}
      value={mode?.success === true ? mode.data : 'normal'}
      onChange={(value) => {
        send('ringer_mode', value);
      }}
    />
  );
}

export function DndButton({
  device,
  on,
  blocked,
}: {
  readonly device: Device;
  readonly on: boolean;
  readonly blocked: boolean;
}): ReactNode {
  const send = useDeviceCommand(device);
  return (
    <Button
      label="Do not disturb"
      icon="moon"
      variant={on ? 'filled' : 'tonal'}
      disabled={blocked}
      {...(blocked ? { hint: NEEDS_ACCESS } : {})}
      onPress={() => {
        send('dnd', !on);
      }}
    />
  );
}

function percentText(level: number): string {
  return `${decimal(Math.round(level))} %`;
}

export function MediaSlider({
  device,
  volume,
  label,
}: {
  readonly device: Device;
  readonly volume: number | null;
  readonly label: boolean;
}): ReactNode {
  const control = useControl(device.id, 'volume');
  const [drag, setDrag] = useState<number | null>(null);
  const pending = typeof control.value === 'number' && control.pending ? control.value : null;
  const shown = drag ?? pending ?? volume;
  return (
    <View className="min-w-36 flex-1 flex-row items-center gap-2">
      <Icon name="volume" size={20} tone="variant" />
      {label ? (
        <Text variant="caption" tone="variant">
          Media
        </Text>
      ) : null}
      <View className="min-w-0 flex-1">
        <Slider
          value={shown}
          min={0}
          max={SLIDER_MAX}
          step={1}
          label="Media volume"
          formatValue={percentText}
          onChange={setDrag}
          onCommit={(level) => {
            setDrag(null);
            background(control.set(level), 'phone.volume_failed');
          }}
        />
      </View>
      <Text variant="callout" className="tabular w-12 text-right">
        {shown === null ? '--' : percentText(shown)}
      </Text>
    </View>
  );
}

export function OfflineLine(): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
      Phone is offline · commands wait until it is back
    </Text>
  );
}

export function MemberLine({ device }: { readonly device: Device }): ReactNode {
  const profileId = device.details['profileId'];
  const person = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  return (
    <View className="min-h-9 flex-row items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5">
      <Icon name="lock" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
        {`Only ${person ?? 'the owner of this phone'} and the owner can change it`}
      </Text>
    </View>
  );
}
