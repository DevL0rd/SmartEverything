import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyGraph, Sparkline, type ChartPoint } from '../../components/charts';
import type { ColourRole } from '../../design/tokens';
import { roomWithin } from '../../features/devices/sensors/layout';
import { domainOf, GRAPH_HEAD_PX, graphFit, MIN_LINE_POINTS } from './cell-graph-model';

export interface CellGraphSlotProps {
  readonly cap: number;
  readonly head: ReactNode;
  readonly children: (height: number) => ReactNode;
}

export function CellGraphSlot({ cap, head, children }: CellGraphSlotProps): ReactNode {
  const [room, setRoom] = useState<number | null>(null);
  const fit = graphFit(cap, room);
  return (
    <View
      onLayout={(event) => {
        setRoom(roomWithin(cap + GRAPH_HEAD_PX, event.nativeEvent.layout.height));
      }}
      className="min-h-0 flex-1 justify-end gap-1"
    >
      {fit.head ? head : null}
      {fit.height === null ? null : children(fit.height)}
    </View>
  );
}

interface GraphLine {
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly area: boolean;
}

export interface LinesGraphProps {
  readonly lines: readonly GraphLine[];
  readonly height: number;
  readonly empty: string;
  readonly faint?: boolean;
}

export function LinesGraph({ lines, height, empty, faint = false }: LinesGraphProps): ReactNode {
  const drawn = lines.filter((line) => line.points.length >= MIN_LINE_POINTS);
  if (drawn.length === 0) {
    return <EmptyGraph text={empty} height={height} />;
  }
  const domain = domainOf(drawn.map((line) => line.points));
  const box = { height };
  return (
    <View style={box} className={faint ? 'w-full opacity-60' : 'w-full'} aria-hidden>
      {drawn.map((line, index) => (
        <View
          key={line.colour}
          className={index === 0 ? 'w-full' : 'absolute inset-x-0 top-0'}
          style={box}
        >
          <Sparkline
            points={line.points}
            colour={line.colour}
            height={height}
            area={line.area}
            domain={domain}
          />
        </View>
      ))}
    </View>
  );
}
