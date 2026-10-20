import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { CalendarCell } from '../model/calendar-model';

const RING = 30;
const STROKE = 3.4;

function polarPath(progress: number): string {
  const radius = (RING - STROKE) / 2;
  const centre = RING / 2;
  const angle = Math.min(0.9999, progress) * 2 * Math.PI;
  const x = centre + radius * Math.sin(angle);
  const y = centre - radius * Math.cos(angle);
  const large = angle > Math.PI ? 1 : 0;
  return `M${String(centre)} ${String(centre - radius)} A${String(radius)} ${String(radius)} 0 ${String(large)} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function DayRing({ cell }: { readonly cell: CalendarCell }): ReactNode {
  const track = useColour('outline-variant');
  const fill = useColour(cell.progress >= 1 ? 'positive' : 'warning');
  return (
    <Svg width={RING} height={RING}>
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={(RING - STROKE) / 2}
        fill="none"
        stroke={track}
        strokeWidth={STROKE}
      />
      {cell.progress > 0 ? (
        <Path
          d={polarPath(cell.progress)}
          fill="none"
          stroke={fill}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

function resultWord(cell: CalendarCell): string {
  if (cell.progress >= 1) {
    return 'goal met';
  }
  return cell.sessions === 0 ? 'no brushing' : `${String(cell.sessions)} brushed, goal not met`;
}

function DayCell({
  cell,
  onPick,
}: {
  readonly cell: CalendarCell | undefined;
  readonly onPick: ((day: string) => void) | undefined;
}): ReactNode {
  if (cell === undefined) {
    return <View className="h-11" />;
  }
  return (
    <Interactive
      role="button"
      label={`${cell.day}, ${resultWord(cell)}`}
      onPress={() => {
        onPick?.(cell.day);
      }}
      className="h-11 w-full items-center justify-center"
    >
      <DayRing cell={cell} />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <Text variant="caption" tone="variant" className="tabular">
          {cell.dayOfMonth}
        </Text>
      </View>
    </Interactive>
  );
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export function DayCalendar({
  cells,
  label,
  onPick,
}: {
  readonly cells: readonly CalendarCell[];
  readonly label: string;
  readonly onPick?: (day: string) => void;
}): ReactNode {
  const rows = Math.max(0, ...cells.map((cell) => cell.row)) + 1;
  return (
    <View accessibilityLabel={label} className="gap-1">
      <View className="flex-row">
        {WEEKDAY_LETTERS.map((name, index) => (
          <View key={index} className="flex-1 items-center">
            <Text variant="caption" tone="faint">
              {name}
            </Text>
          </View>
        ))}
      </View>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} className="flex-row">
          {WEEKDAY_LETTERS.map((_name, column) => (
            <View key={column} className="flex-1 items-center">
              <DayCell
                cell={cells.find((cell) => cell.row === row && cell.column === column)}
                onPick={onPick}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
