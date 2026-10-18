import type { ReactNode } from 'react';
import { G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ShellyDevice } from '@smarteverything/shelly';
import { rounded } from '../../features/device-visuals';
import { zoneState } from './presence-model';
import { zoneName } from './room-map-legend';
import type { MapModel, ZoneShape } from './room-geometry';
import type { Paint } from './room-map-layers';

function range(from: number, to: number): readonly number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

function AxisLabel({
  at,
  text,
  anchor,
  paint,
}: {
  readonly at: { readonly x: number; readonly y: number };
  readonly text: string;
  readonly anchor: 'middle' | 'end';
  readonly paint: Paint;
}): ReactNode {
  return (
    <SvgText
      transform={[{ translateX: at.x }, { translateY: at.y }]}
      textAnchor={anchor}
      fontSize={10 * paint.u}
      fill={paint.c.variant}
    >
      {text}
    </SvgText>
  );
}

function AxisLabels({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  const { room } = model.frame;
  const sx = model.origin / 2;
  const across = range(Math.ceil(room.left - sx), Math.floor(room.right - sx)).filter(
    (metre) => metre % 2 === 0,
  );
  const down = range(1, Math.floor(room.bottom)).filter((metre) => metre % 2 === 0);
  return (
    <>
      {across.map((metre) => (
        <AxisLabel
          key={`x${String(metre)}`}
          at={{ x: sx + metre, y: -0.35 }}
          text={`${String(Math.abs(metre))} m`}
          anchor="middle"
          paint={paint}
        />
      ))}
      {down.map((metre) => (
        <AxisLabel
          key={`y${String(metre)}`}
          at={{ x: room.left - 0.12, y: metre + 3 * paint.u }}
          text={`${String(metre)} m`}
          anchor="end"
          paint={paint}
        />
      ))}
    </>
  );
}

function WallScale({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  const { room } = model.frame;
  const sx = model.origin / 2;
  const across = range(Math.ceil(room.left - sx), Math.floor(room.right - sx));
  return (
    <>
      <Line
        x1={room.left}
        y1={0}
        x2={room.right}
        y2={0}
        stroke={paint.c.edge}
        strokeWidth={2 * paint.u}
      />
      {across.map((metre) => (
        <Line
          key={metre}
          x1={sx + metre}
          y1={0}
          x2={sx + metre}
          y2={-0.18}
          stroke={paint.c.edge}
          strokeWidth={paint.u}
        />
      ))}
      {paint.hero ? <AxisLabels model={model} paint={paint} /> : null}
    </>
  );
}

export function Ruler({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  const { room } = model.frame;
  const y = room.bottom + 0.5;
  return (
    <G pointerEvents="none">
      <WallScale model={model} paint={paint} />
      <Line
        x1={room.left + 0.3}
        y1={y}
        x2={room.left + 1.3}
        y2={y}
        stroke={paint.c.variant}
        strokeWidth={2 * paint.u}
      />
      <SvgText
        transform={[{ translateX: room.left + 1.5 }, { translateY: y + 4 * paint.u }]}
        fontSize={11 * paint.u}
        fill={paint.c.variant}
      >
        1 m
      </SvgText>
    </G>
  );
}

function labelText(sensor: ShellyDevice, zone: ShellyDevice['zones'][number]): string {
  const state = zoneState(sensor, zone);
  if (state === 'Disabled') return `${zoneName(zone)} · off`;
  if (state === 'Occupied') return `${zoneName(zone)} · ${String(zone.status?.num_objects ?? 0)}`;
  return `${zoneName(zone)} · ${state.toLowerCase()}`;
}

function Label({
  text,
  shape,
  paint,
}: {
  readonly text: string;
  readonly shape: ZoneShape;
  readonly paint: Paint;
}): ReactNode {
  const { u } = paint;
  const width = text.length * 6.2 * u + 14 * u;
  const height = 20 * u;
  if (shape.label.width < width || shape.label.height < height) return null;
  const { x, y } = shape.label;
  return (
    <G pointerEvents="none">
      <Path
        d={rounded({ x: x - width / 2, y: y - height / 2, w: width, h: height, r: 6 * u })}
        fill={paint.c.pill}
        fillOpacity={0.7}
      />
      <SvgText
        transform={[{ translateX: x }, { translateY: y + 4 * u }]}
        textAnchor="middle"
        fontSize={12 * u}
        fontFamily="Geist-Medium"
        fill={paint.c.ink}
      >
        {text}
      </SvgText>
    </G>
  );
}

export function LabelLayer({
  sensor,
  model,
  paint,
  selected,
}: {
  readonly sensor: ShellyDevice;
  readonly model: MapModel;
  readonly paint: Paint;
  readonly selected: string | null;
}): ReactNode {
  return sensor.zones.map((zone) => {
    const shape = model.shapes.get(zone.key);
    const hidden = zone.main || (selected !== null && selected !== zone.key);
    if (shape === undefined || hidden) return null;
    return <Label key={zone.key} text={labelText(sensor, zone)} shape={shape} paint={paint} />;
  });
}
