import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IR_SPEED_STEPS, IR_TEMP_RANGE, type IrRemoteState } from '@smarteverything/domain';
import { StateTimeline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { readMinute } from '../../../store/clock';
import { useDeviceValue } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { LiveSpark } from '../card/live-spark';
import type { RemoteCategory } from './remote-category';
import { sentWindow } from './sent-strip';

const STEP_BASE = 6;
const STEP_RISE = 14;

function stepStyle(index: number, of: number): { readonly height: number } {
  return { height: STEP_BASE + (index * STEP_RISE) / of };
}

function StepBars({
  lit,
  of,
  label,
  known,
}: {
  readonly lit: number;
  readonly of: number;
  readonly label: string;
  readonly known: boolean;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={known ? `${label} ${String(lit)} of ${String(of)}` : `${label} unknown`}
      className="flex-row items-end gap-1"
    >
      {Array.from({ length: of }, (_, index) => (
        <View
          key={index}
          style={stepStyle(index, of)}
          className={cn('flex-1 rounded-xs', index < lit ? 'bg-primary' : 'bg-surface-3')}
        />
      ))}
    </View>
  );
}

function SentStrip({
  assumed,
  height,
}: {
  readonly assumed: IrRemoteState;
  readonly height: number;
}): ReactNode {
  const window = sentWindow(assumed.recent, readMinute());
  return (
    <StateTimeline
      segments={window.segments}
      colours={{ sent: 'primary' }}
      label="Keys sent in the last 24 hours"
      height={height}
      from={window.from}
      to={window.to}
      captions={['24 h ago', 'Now']}
      empty="Nothing sent yet"
      track="surface-2"
    />
  );
}

function AcRoom({
  blaster,
  assumed,
  height,
}: {
  readonly blaster: Device;
  readonly assumed: IrRemoteState;
  readonly height: number;
}): ReactNode {
  const room = useDeviceValue(blaster.id, 'temperature')?.value;
  const target =
    assumed.on === true && assumed.temp !== null
      ? {
          top:
            (1 - (assumed.temp - IR_TEMP_RANGE.min) / (IR_TEMP_RANGE.max - IR_TEMP_RANGE.min)) *
            height,
        }
      : null;
  return (
    <View className="gap-0.5">
      <View>
        <LiveSpark
          device={blaster}
          capability="temperature"
          colour="temp-warm"
          height={height}
          domain={[IR_TEMP_RANGE.min, IR_TEMP_RANGE.max]}
        />
        {target === null ? null : (
          <View
            style={target}
            className="absolute inset-x-0 border-t border-dashed border-on-surface-variant"
          />
        )}
      </View>
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {typeof room === 'number'
          ? target === null
            ? `Room ${room.toFixed(0)} °C, 24 h`
            : `Room ${room.toFixed(0)} °C → target ${String(assumed.temp)} °C`
          : 'Room temperature, 24 h'}
      </Text>
    </View>
  );
}

export function RemoteGraph({
  category,
  assumed,
  blaster,
  height,
}: {
  readonly category: RemoteCategory;
  readonly assumed: IrRemoteState;
  readonly blaster: Device | null;
  readonly height: number;
}): ReactNode {
  if (category === 'ac' && blaster !== null) {
    return <AcRoom blaster={blaster} assumed={assumed} height={height} />;
  }
  if (category === 'fan') {
    return (
      <StepBars
        lit={assumed.on === true ? (assumed.speed ?? 0) : 0}
        of={IR_SPEED_STEPS}
        label="Speed"
        known={assumed.speed !== null}
      />
    );
  }
  return <SentStrip assumed={assumed} height={height} />;
}
