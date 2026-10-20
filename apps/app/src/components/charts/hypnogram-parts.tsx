import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { clock } from '../../format/time';
import { Icon } from '../icon';
import { Text } from '../text';
import { barPath } from './bar-path';
import { Crosshair, Readout, type ScrubModel } from './chart-parts';
import {
  HYPNOGRAM_LANES,
  STAGE_COLOURS,
  STAGE_NAMES,
  bandOf,
  blockOf,
  connectorsOf,
  ghostPath,
  isUnstaged,
  laneCentre,
  readoutOf,
  spanAt,
  type HypnogramFrame,
  type HypnogramSegment,
  type HypnogramStage,
} from './hypnogram-model';
import { labelFits, nightX, type NightTick } from './night-axis';

const GUIDE_OPACITY = 0.08;
const HALF_OPACITY = 0.05;
const CONNECTOR_OPACITY = 0.3;
const DIMMED_OPACITY = 0.4;
const GHOST_OPACITY = 0.12;
const TICK_MARK_PX = 4;
const TICK_LABEL_W = 44;
const MARKER_ROW_H = 18;
const CURSOR_DOT_R = 4;

function useStageColours(): Readonly<Record<HypnogramStage, string>> {
  return {
    awake: useColour(STAGE_COLOURS.awake),
    rem: useColour(STAGE_COLOURS.rem),
    light: useColour(STAGE_COLOURS.light),
    deep: useColour(STAGE_COLOURS.deep),
    asleep: useColour(STAGE_COLOURS.asleep),
  };
}

export function Guides({
  frame,
  ticks,
  lanes,
  vertical,
}: {
  readonly frame: HypnogramFrame;
  readonly ticks: readonly NightTick[];
  readonly lanes: boolean;
  readonly vertical: boolean;
}): ReactNode {
  const stroke = useColour('on-surface');
  return (
    <G>
      {vertical
        ? ticks.map((tick) => (
            <Line
              key={tick.at}
              x1={nightX(frame, tick.at)}
              x2={nightX(frame, tick.at)}
              y1={0}
              y2={frame.plotHeight}
              stroke={stroke}
              strokeOpacity={tick.kind === 'half' ? HALF_OPACITY : GUIDE_OPACITY}
              strokeWidth={1}
            />
          ))
        : null}
      {lanes
        ? HYPNOGRAM_LANES.map((stage) => (
            <Line
              key={stage}
              x1={frame.left}
              x2={frame.right}
              y1={laneCentre(frame, stage)}
              y2={laneCentre(frame, stage)}
              stroke={stroke}
              strokeOpacity={GUIDE_OPACITY}
              strokeWidth={1}
            />
          ))
        : null}
    </G>
  );
}

export function AxisMarks({
  frame,
  ticks,
}: {
  readonly frame: HypnogramFrame;
  readonly ticks: readonly NightTick[];
}): ReactNode {
  const stroke = useColour('on-surface-faint');
  return (
    <G>
      {ticks
        .filter((tick) => tick.kind !== 'half')
        .map((tick) => (
          <Line
            key={tick.at}
            x1={nightX(frame, tick.at)}
            x2={nightX(frame, tick.at)}
            y1={frame.plotHeight}
            y2={frame.plotHeight + TICK_MARK_PX}
            stroke={stroke}
            strokeWidth={1}
          />
        ))}
    </G>
  );
}

export function Blocks({
  segments,
  frame,
  active,
}: {
  readonly segments: readonly HypnogramSegment[];
  readonly frame: HypnogramFrame;
  readonly active: HypnogramSegment | null;
}): ReactNode {
  const colours = useStageColours();
  const connector = useColour('on-surface');
  return (
    <G>
      {connectorsOf(segments, frame).map((link) => (
        <Line
          key={link.x}
          x1={link.x}
          x2={link.x}
          y1={link.from}
          y2={link.to}
          stroke={connector}
          strokeOpacity={CONNECTOR_OPACITY}
          strokeWidth={1.5}
        />
      ))}
      {segments.map((segment, index) => {
        const block = blockOf(segment, frame);
        const radius = block.radius;
        return (
          <Path
            key={`${String(index)}-${block.key}`}
            d={barPath(
              { x: block.x, width: block.width, top: block.y, bottom: block.y + block.height },
              { top: radius, bottom: radius },
            )}
            fill={colours[segment.stage]}
            fillOpacity={active === null || active === segment ? 1 : DIMMED_OPACITY}
          />
        );
      })}
    </G>
  );
}

export function AsleepBand({ frame }: { readonly frame: HypnogramFrame }): ReactNode {
  const fill = useColour('sleep-asleep');
  const ink = useColour('sleep-on-asleep');
  const band = bandOf(frame);
  const caption = [{ translateX: band.x + 14 }, { translateY: band.y + band.height / 2 + 5 }];
  return (
    <G>
      <Path
        d={barPath(
          { x: band.x, width: band.width, top: band.y, bottom: band.y + band.height },
          { top: band.radius, bottom: band.radius },
        )}
        fill={fill}
      />
      <SvgText transform={caption} fontSize={13} fontWeight="600" fill={ink}>
        {STAGE_NAMES.asleep}
      </SvgText>
    </G>
  );
}

export function Ghost({ frame }: { readonly frame: HypnogramFrame }): ReactNode {
  const stroke = useColour('on-surface');
  return (
    <Path
      d={ghostPath(frame)}
      fill="none"
      stroke={stroke}
      strokeOpacity={GHOST_OPACITY}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

export function LaneLabels({ frame }: { readonly frame: HypnogramFrame }): ReactNode {
  return (
    <>
      {HYPNOGRAM_LANES.map((stage) => {
        const place = { top: laneCentre(frame, stage) - 8, width: frame.left - 6 };
        return (
          <View key={stage} pointerEvents="none" style={place} className="absolute left-0">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {STAGE_NAMES[stage]}
            </Text>
          </View>
        );
      })}
    </>
  );
}

export function TickLabels({
  frame,
  ticks,
}: {
  readonly frame: HypnogramFrame;
  readonly ticks: readonly NightTick[];
}): ReactNode {
  return (
    <>
      {ticks.map((tick) => {
        const x = nightX(frame, tick.at);
        if (tick.label === null || !labelFits(x, frame.width)) {
          return null;
        }
        const place = { left: x - TICK_LABEL_W / 2, top: frame.plotHeight + TICK_MARK_PX + 1 };
        return (
          <View key={tick.at} pointerEvents="none" style={place} className="absolute" aria-hidden>
            <Text
              variant="caption"
              tone="variant"
              align="center"
              numberOfLines={1}
              className="tabular w-11"
            >
              {tick.label}
            </Text>
          </View>
        );
      })}
    </>
  );
}

export function Markers({
  frame,
  compact,
}: {
  readonly frame: HypnogramFrame;
  readonly compact: boolean;
}): ReactNode {
  const place = {
    top: compact ? frame.plotHeight + 2 : frame.height - MARKER_ROW_H,
    left: frame.left,
    right: frame.width - frame.right,
  };
  return (
    <View
      pointerEvents="none"
      style={place}
      className="absolute flex-row items-center justify-between"
    >
      <View className="flex-row items-center gap-1">
        <Icon name="moon" size={16} tone="default" />
        <Text variant="caption" className="tabular">
          {clock(frame.window.from)}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon name="sun" size={16} tone="default" />
        <Text variant="caption" className="tabular">
          {clock(frame.window.to)}
        </Text>
      </View>
    </View>
  );
}

function scrubModelOf(frame: HypnogramFrame): ScrubModel {
  return {
    box: {
      width: frame.width,
      height: frame.plotHeight,
      left: frame.left,
      right: frame.right,
      top: 0,
      bottom: frame.plotHeight,
    },
    x: (at) => nightX(frame, at),
  };
}

export function Cursor({
  segments,
  frame,
  at,
}: {
  readonly segments: readonly HypnogramSegment[];
  readonly frame: HypnogramFrame;
  readonly at: number;
}): ReactNode {
  const segment = spanAt(segments, at);
  const dot = useColour('on-surface');
  const ring = useColour('surface-1');
  if (segment === null) {
    return null;
  }
  const readout = readoutOf(segment);
  const hit = {
    series: { points: [], colour: STAGE_COLOURS[segment.stage], label: readout.name },
    point: { t: at, v: 0 },
  };
  const model = scrubModelOf(frame);
  return (
    <>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width={frame.width} height={frame.plotHeight}>
          <Crosshair hits={[hit]} model={model} />
          {isUnstaged(segments) ? null : (
            <Circle
              cx={nightX(frame, at)}
              cy={laneCentre(frame, segment.stage)}
              r={CURSOR_DOT_R}
              fill={dot}
              stroke={ring}
              strokeWidth={2}
            />
          )}
        </Svg>
      </View>
      <Readout
        hits={[hit]}
        model={model}
        heading={readout.heading}
        valueOf={() => readout.length}
      />
    </>
  );
}
