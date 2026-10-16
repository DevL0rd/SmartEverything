import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import type { ShellyArea, ShellyTrack } from '@smarteverything/domain';
import { useColour } from '../../design/colour';
import type { GridCell } from './area-geometry';
import type { PainterViewport } from './painter-viewport';
import { PresenceTracks } from './room-map';

function Segments({
  area,
  color,
  opacity,
}: {
  readonly area: ShellyArea;
  readonly color: string;
  readonly opacity: number;
}): ReactNode {
  return area.map(([x1, y1, x2, y2], index) => (
    <Path
      key={index}
      d={`M${String(8 - x1)} ${String(y1)} H${String(8 - x2)} V${String(y2)} H${String(8 - x1)} Z`}
      fill={color}
      fillOpacity={opacity}
      stroke={color}
      strokeWidth={0.04}
    />
  ));
}

function PainterGrid({
  viewport,
  color,
}: {
  readonly viewport: PainterViewport;
  readonly color: string;
}): ReactNode {
  const step = Math.max(1, Math.ceil(Math.max(viewport.columns, viewport.rows) / 40));
  return (
    <G stroke={color} strokeWidth={0.025}>
      {Array.from({ length: 41 }, (_, n) => (
        <G key={n}>
          <Line
            x1={viewport.left}
            y1={viewport.top + n * step}
            x2={viewport.left + viewport.columns}
            y2={viewport.top + n * step}
          />
          <Line
            x1={viewport.left + n * step}
            y1={viewport.top}
            x2={viewport.left + n * step}
            y2={viewport.top + viewport.rows}
          />
        </G>
      ))}
    </G>
  );
}

export function PainterCanvas({
  tracks,
  area,
  context,
  origin,
  preview,
  cursor,
  width,
  viewport,
}: {
  readonly tracks: readonly ShellyTrack[];
  readonly area: ShellyArea;
  readonly context: ShellyArea;
  readonly origin: number;
  readonly preview: ShellyArea;
  readonly cursor: GridCell;
  readonly width: number;
  readonly viewport: PainterViewport;
}): ReactNode {
  const primary = useColour('primary');
  const edge = useColour('outline');
  const background = useColour('surface-2');
  const positive = useColour('positive');
  return (
    <Svg
      width="100%"
      height={(width * viewport.rows) / viewport.columns}
      viewBox={`${String(viewport.left)} ${String(viewport.top)} ${String(viewport.columns)} ${String(viewport.rows)}`}
      pointerEvents="none"
    >
      <Path
        d={`M${String(viewport.left)} ${String(viewport.top)} h${String(viewport.columns)} v${String(viewport.rows)} h${String(-viewport.columns)} Z`}
        fill={background}
      />
      <Segments area={context} color={edge} opacity={0.06} />
      <Segments area={area} color={primary} opacity={0.16} />
      <Segments area={preview} color={primary} opacity={0.32} />
      <PainterGrid viewport={viewport} color={edge} />
      <Path
        d={`M${String(7 - cursor.x)} ${String(cursor.y)} h1 v1 h-1 Z`}
        stroke={primary}
        strokeWidth={0.09}
        fill="none"
      />
      <PresenceTracks tracks={tracks} colour={positive} />
      <Circle cx={origin} cy={0} r={0.16} fill={primary} />
    </Svg>
  );
}
