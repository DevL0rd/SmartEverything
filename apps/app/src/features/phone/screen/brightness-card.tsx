import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Slider } from '../../../components/slider';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { selectionTick } from '../../../platform/haptics';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { LockLine, NeedLine } from '../screens/detail-parts';

const NEEDS_SETTINGS = 'Allow Modify system settings on the phone to change brightness here';

function percentText(level: number): string {
  return `${decimal(Math.round(level))} %`;
}

function ReadOnly({ level }: { readonly level: number | null }): ReactNode {
  return (
    <View className="gap-3">
      <View className="min-h-touch-min flex-row items-center gap-3">
        <Icon name="sun" size={20} tone="variant" />
        <View className="min-w-0 flex-1">
          <ProgressBar
            progress={level === null ? null : level / 100}
            colour="viz-1"
            label={level === null ? 'Brightness unknown' : `Brightness ${String(level)} percent`}
          />
        </View>
        <Text variant="callout" className="tabular w-12 text-right">
          {level === null ? '--' : percentText(level)}
        </Text>
      </View>
      <NeedLine text={NEEDS_SETTINGS} />
    </View>
  );
}

function AutoRow({
  device,
  auto,
  disabled,
}: {
  readonly device: Device;
  readonly auto: boolean;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, 'auto_brightness');
  const shown = control.pending && typeof control.value === 'boolean' ? control.value : auto;
  return (
    <Interactive
      role="switch"
      label="Automatic brightness"
      checked={shown}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        background(control.set(!shown), 'phone.auto_brightness_failed');
      }}
      className="min-h-touch-min flex-row items-center gap-3"
    >
      <Text variant="body" className="flex-1">
        Automatic brightness
      </Text>
      <SwitchTrack value={shown} />
    </Interactive>
  );
}

function Adjust({
  device,
  level,
  auto,
  disabled,
}: {
  readonly device: Device;
  readonly level: number | null;
  readonly auto: boolean;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, 'brightness');
  const [drag, setDrag] = useState<number | null>(null);
  const pending = typeof control.value === 'number' && control.pending ? control.value : null;
  const shown = drag ?? pending ?? level;
  return (
    <>
      <View className="min-h-touch-min flex-row items-center gap-3">
        <Icon name="sun" size={20} tone="variant" />
        <View className="min-w-0 flex-1">
          <Slider
            value={shown}
            min={0}
            max={100}
            step={1}
            label="Brightness"
            disabled={disabled || auto}
            formatValue={percentText}
            onChange={setDrag}
            onCommit={(next) => {
              setDrag(null);
              background(control.set(next), 'phone.brightness_failed');
            }}
          />
        </View>
        <Text variant="callout" className="tabular w-16 text-right">
          {shown === null ? '--' : `${auto ? 'About ' : ''}${percentText(shown)}`}
        </Text>
      </View>
      <AutoRow device={device} auto={auto} disabled={disabled} />
    </>
  );
}

export function BrightnessCard({
  device,
  level,
  auto,
  writable,
  canAct,
  person,
}: {
  readonly device: Device;
  readonly level: number | null;
  readonly auto: boolean;
  readonly writable: boolean;
  readonly canAct: boolean;
  readonly person: string;
}): ReactNode {
  return (
    <Card title="Brightness" icon="sun">
      {writable ? (
        <Adjust device={device} level={level} auto={auto} disabled={!canAct} />
      ) : (
        <ReadOnly level={level} />
      )}
      {canAct ? null : <LockLine text={`Only ${person} and the owner can change it`} />}
    </Card>
  );
}
