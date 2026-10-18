import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhoneDetail } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { ProgressBar } from '../../../components/charts';
import { Badge } from '../../../components/badge';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import type { PhoneReadings } from '../phone-values';
import { LockLine } from '../screens/detail-parts';
import {
  VOLUME_STREAMS,
  callLevel,
  levelOf,
  outputIcon,
  outputText,
  type StreamSpec,
} from './sound-model';

const LABEL_WIDTH = 'w-28';

function percentText(level: number): string {
  return `${decimal(Math.round(level))} %`;
}

function StreamLabel({ spec }: { readonly spec: StreamSpec }): ReactNode {
  return (
    <View className={`${LABEL_WIDTH} shrink-0 flex-row items-center gap-1.5`}>
      <Icon name={spec.icon} size={20} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {spec.label}
      </Text>
    </View>
  );
}

function StreamSlider({
  device,
  spec,
  level,
  disabled,
}: {
  readonly device: Device;
  readonly spec: StreamSpec;
  readonly level: number | null;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, spec.capability);
  const [drag, setDrag] = useState<number | null>(null);
  const pending = typeof control.value === 'number' && control.pending ? control.value : null;
  const shown = drag ?? pending ?? level;
  return (
    <View className="min-h-touch-min flex-row items-center gap-2">
      <StreamLabel spec={spec} />
      <View className="min-w-0 flex-1">
        <Slider
          value={shown}
          min={0}
          max={100}
          step={1}
          label={`${spec.label} volume`}
          disabled={disabled}
          formatValue={percentText}
          onChange={setDrag}
          onCommit={(next) => {
            setDrag(null);
            background(control.set(next), 'phone.volume_failed');
          }}
        />
      </View>
      <Text variant="callout" className="tabular w-12 text-right">
        {shown === null ? '--' : percentText(shown)}
      </Text>
    </View>
  );
}

function CallRow({ level }: { readonly level: number }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2">
      <View className={`${LABEL_WIDTH} shrink-0 flex-row items-center gap-1.5`}>
        <Icon name="phone" size={20} tone="variant" />
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          Call
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <ProgressBar
          progress={level / 100}
          colour="on-surface-variant"
          label={`Call volume ${String(level)} percent, read only`}
        />
      </View>
      <Text variant="callout" className="tabular w-12 text-right">
        {percentText(level)}
      </Text>
      <Badge label="Read only" />
    </View>
  );
}

function OutputRow({
  output,
}: {
  readonly output: NonNullable<PhoneDetail['sound']>['output'];
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="caption" tone="variant">
        Output
      </Text>
      <Badge label={outputText(output)} icon={outputIcon(output.kind)} />
    </View>
  );
}

export function VolumeCard({
  device,
  sound,
  readings,
  canAct,
  person,
}: {
  readonly device: Device;
  readonly sound: PhoneDetail['sound'];
  readonly readings: PhoneReadings;
  readonly canAct: boolean;
  readonly person: string;
}): ReactNode {
  const call = callLevel(sound);
  return (
    <Card title="Volumes" icon="volume">
      {VOLUME_STREAMS.map((spec) => (
        <StreamSlider
          key={spec.stream}
          device={device}
          spec={spec}
          level={levelOf(spec, sound, readings)}
          disabled={!canAct}
        />
      ))}
      {call === null ? null : <CallRow level={call} />}
      {sound === undefined ? null : <OutputRow output={sound.output} />}
      {canAct ? null : <LockLine text={`Only ${person} and the owner can change the volume`} />}
    </Card>
  );
}
