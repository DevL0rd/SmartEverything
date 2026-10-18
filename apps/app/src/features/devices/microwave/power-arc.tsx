import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { IconButton } from '../../../components/icon-button';
import { useColour } from '../../../design/colour';
import { selectionTick } from '../../../platform/haptics';
import { ARC_HEIGHT, ARC_WIDTH, stepped, ticksOf } from './power-arc-model';
import { powerWords } from './run-model';

const TICK_WIDTH = 12;
const VALUE_SIZE = 30;
const UNIT_SIZE = 12;

function ArcLabels({ value }: { readonly value: string }): ReactNode {
  const ink = useColour('on-surface');
  const faint = useColour('on-surface-variant');
  const centre = String(ARC_WIDTH / 2);
  return (
    <>
      <SvgText
        transform={`translate(${centre} 100)`}
        textAnchor="middle"
        fontSize={VALUE_SIZE}
        fontFamily="Geist-SemiBold"
        fill={ink}
      >
        {powerWords(value).replace(' W', '')}
      </SvgText>
      <SvgText
        transform={`translate(${centre} 116)`}
        textAnchor="middle"
        fontSize={UNIT_SIZE}
        fontFamily="Geist-Regular"
        fill={faint}
      >
        {value.endsWith('W') ? 'watts' : 'power'}
      </SvgText>
    </>
  );
}

function ArcFace({
  levels,
  index,
  value,
  disabled,
}: {
  readonly levels: readonly string[];
  readonly index: number;
  readonly value: string;
  readonly disabled: boolean;
}): ReactNode {
  const lit = useColour('temp-warm');
  const unlit = useColour('outline');
  return (
    <Svg
      width={ARC_WIDTH}
      height={ARC_HEIGHT}
      viewBox={`0 0 ${String(ARC_WIDTH)} ${String(ARC_HEIGHT)}`}
    >
      {ticksOf(levels, index).map((tick) => (
        <Line
          key={tick.key}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke={tick.lit ? lit : unlit}
          strokeWidth={TICK_WIDTH}
          strokeLinecap="round"
          opacity={disabled ? 0.5 : 1}
        />
      ))}
      <ArcLabels value={value} />
    </Svg>
  );
}

function Steps({
  index,
  count,
  disabled,
  move,
}: {
  readonly index: number;
  readonly count: number;
  readonly disabled: boolean;
  readonly move: (delta: number) => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <IconButton
        icon="minus"
        label="Lower power"
        variant="tonal"
        disabled={disabled || index === 0}
        onPress={() => {
          move(-1);
        }}
      />
      <IconButton
        icon="plus"
        label="Higher power"
        variant="tonal"
        disabled={disabled || index === count - 1}
        onPress={() => {
          move(1);
        }}
      />
    </View>
  );
}

export function PowerArc({
  levels,
  value,
  disabled,
  onChange,
}: {
  readonly levels: readonly string[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (level: string) => void;
}): ReactNode {
  const index = Math.max(0, levels.indexOf(value));
  const move = (delta: number): void => {
    const next = levels[stepped(index, delta, levels.length)];
    if (next !== undefined && next !== value) {
      selectionTick();
      onChange(next);
    }
  };
  return (
    <View
      className="items-center gap-1"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Power ${powerWords(value)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        move(event.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
    >
      <ArcFace levels={levels} index={index} value={value} disabled={disabled} />
      <Steps index={index} count={levels.length} disabled={disabled} move={move} />
    </View>
  );
}
