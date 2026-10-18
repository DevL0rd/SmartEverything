import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Figure, type FigureSize } from '../../../components/figure';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { WidgetFrame } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { metricColour, metricShort, type MetricReading } from '../../climate';
import { columnsIn } from '../components/fit-math';
import { useHome } from '../data/home-data';

const READING_MIN_WIDTH = 72;

const READING_GAP = 16;

const READINGS_ROW: ViewStyle = { gap: READING_GAP };

function glowOf(readings: readonly MetricReading[]): ColourRole | null {
  const air = readings.find((reading) => reading.metric === 'pm25' && !reading.stale);
  return air === undefined ? null : metricColour(air);
}

function Verdict({ reading }: { readonly reading: MetricReading }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className={cn(
          'size-2 rounded-full',
          reading.stale ? 'bg-outline' : STATUS_FILL[reading.tone],
        )}
      />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {reading.stale ? 'Not current' : reading.verdict}
      </Text>
    </View>
  );
}

function Reading({
  reading,
  figure,
}: {
  readonly reading: MetricReading;
  readonly figure: FigureSize;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {metricShort(reading.metric)}
      </Text>
      <Figure
        value={reading.value}
        size={figure}
        stale={reading.stale}
        {...(reading.unit === null ? {} : { unit: reading.unit })}
      />
      <Verdict reading={reading} />
    </View>
  );
}

function lineOf(reading: MetricReading): string {
  const unit = reading.unit === null ? '' : ` ${reading.unit}`;
  return `${metricShort(reading.metric)} ${reading.value}${unit}`;
}

function Glance({ readings }: { readonly readings: readonly MetricReading[] }): ReactNode {
  const [first, second] = readings;
  if (first === undefined) {
    return null;
  }
  return (
    <>
      <Figure
        value={first.value}
        size="m"
        stale={first.stale}
        {...(first.unit === null ? {} : { unit: first.unit })}
      />
      {second === undefined ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {lineOf(second)}
        </Text>
      )}
    </>
  );
}

export function GlanceWidget(): ReactNode {
  const readings = useHome((view) => view.readings);
  const { frame, cls } = useWidgetFace();
  const shown = columnsIn(frame.width, READING_MIN_WIDTH, READING_GAP, readings.length);
  return (
    <WidgetFrame
      title="Indoors"
      icon="thermometer"
      accent="temp-warm"
      glow={glowOf(readings)}
      href={href.devices()}
    >
      {cls === 's' ? (
        <Glance readings={readings} />
      ) : (
        <View className="flex-1 flex-row" style={READINGS_ROW}>
          {readings.slice(0, shown).map((reading) => (
            <Reading
              key={reading.metric}
              reading={reading}
              figure={cls === 'xs' || cls === 'm' ? 'm' : 'l'}
            />
          ))}
        </View>
      )}
    </WidgetFrame>
  );
}
