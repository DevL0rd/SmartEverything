import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { STAGE_COLOURS } from '../../../components/charts/hypnogram-model';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { hoursMinutes } from '../../../format/time';
import { stackOf, stripOf, type StageSlice } from '../model/night-card';
import type { StageRow, SummaryStage } from '../model/sleep-summary';

const LEGEND_STAGES: readonly SummaryStage[] = ['deep', 'light', 'rem', 'awake'];
const STAGE_TEXT: Readonly<Record<SummaryStage, string>> = {
  deep: 'Deep',
  light: 'Light',
  rem: 'REM',
  awake: 'Awake',
};
const DOT_HALF_PX = 6;

function Swatch({ stage }: { readonly stage: SummaryStage }): ReactNode {
  const fill = { backgroundColor: useColour(STAGE_COLOURS[stage]) };
  return <View style={fill} className="size-2.5 rounded-xs" />;
}

function Piece({ slice }: { readonly slice: StageSlice }): ReactNode {
  const fill = {
    flexGrow: slice.share,
    flexBasis: 0,
    backgroundColor: useColour(STAGE_COLOURS[slice.stage]),
  };
  return <View style={fill} className="h-3 min-w-1 rounded-xs" />;
}

function Stack({ rows }: { readonly rows: readonly StageRow[] }): ReactNode {
  return (
    <View aria-hidden className="h-3 w-full flex-row gap-0.5">
      {stackOf(rows).map((slice) => (
        <Piece key={slice.stage} slice={slice} />
      ))}
    </View>
  );
}

function RangeStrip({ row }: { readonly row: StageRow }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const strip = stripOf(row);
  const band = {
    left: strip.bandLeft * width,
    width: strip.bandWidth * width,
    backgroundColor: useColour('sleep-band'),
    borderColor: useColour('outline'),
  };
  const dot = {
    left: strip.dot * width - DOT_HALF_PX,
    backgroundColor: useColour(STAGE_COLOURS[row.stage]),
  };
  return (
    <View aria-hidden className="h-3 flex-1 justify-center px-1.5">
      <View onLayout={onLayout} className="h-2.5 justify-center">
        <View className="absolute inset-x-0 h-0.5 rounded-full bg-surface-3" />
        {width === 0 ? null : (
          <>
            <View style={band} className="absolute h-2.5 rounded-full border" />
            <View style={dot} className="absolute size-3 rounded-full border-2 border-surface-1" />
          </>
        )}
      </View>
    </View>
  );
}

function Row({ row }: { readonly row: StageRow }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${row.label} ${hoursMinutes(row.minutes)}, ${String(row.percent)}%. ${row.typical.caption}.`}
      className="gap-1.5"
    >
      <View className="flex-row items-center gap-2">
        <Swatch stage={row.stage} />
        <Text variant="body" className="flex-1" numberOfLines={1}>
          {row.label}
        </Text>
        <Text variant="body-strong" className="tabular" numberOfLines={1}>
          {`${hoursMinutes(row.minutes)} · ${String(row.percent)}%`}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <RangeStrip row={row} />
        <Text variant="footnote" tone="variant" className="w-32" numberOfLines={1}>
          {row.typical.caption}
        </Text>
      </View>
    </View>
  );
}

export function StageSummary({ rows }: { readonly rows: readonly StageRow[] }): ReactNode {
  if (rows.length === 0) {
    return null;
  }
  return (
    <View className="gap-3">
      <Stack rows={rows} />
      {rows.map((row) => (
        <Row key={row.stage} row={row} />
      ))}
    </View>
  );
}

export function StageLegend(): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {LEGEND_STAGES.map((stage) => (
        <View key={stage} className="flex-row items-center gap-1.5">
          <Swatch stage={stage} />
          <Text variant="footnote" tone="variant">
            {STAGE_TEXT[stage]}
          </Text>
        </View>
      ))}
    </View>
  );
}
