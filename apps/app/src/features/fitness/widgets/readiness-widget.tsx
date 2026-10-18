import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Gauge, type GaugeBand } from '../../../components/charts';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { isTile } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useReadiness } from '../data/readiness';
import { useTodayContext } from '../data/today';
import { readinessWord, type Score } from '../model/scores';

const BANDS: readonly GaugeBand[] = [
  { upTo: 59, colour: 'warning' },
  { upTo: 79, colour: 'viz-1' },
  { upTo: 100, colour: 'positive' },
];

function Dial({ score, size }: { readonly score: Score; readonly size: number }): ReactNode {
  return (
    <Gauge
      value={score.value}
      min={0}
      max={100}
      bands={BANDS}
      size={size}
      label={`Readiness ${String(score.value)}, ${readinessWord(score.value)}`}
    >
      <Text variant="title-2" className="tabular">
        {String(score.value)}
      </Text>
    </Gauge>
  );
}

function Reasons({ score }: { readonly score: Score }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="body-strong">{readinessWord(score.value)}</Text>
      {score.parts.slice(0, 3).map((part) => (
        <Text key={part.key} variant="footnote" tone="variant" numberOfLines={1}>
          {`${part.label}: ${part.explanation}`}
        </Text>
      ))}
    </View>
  );
}

export function ReadinessWidget(): ReactNode {
  const data = useTodayContext();
  const score = useReadiness(data);
  const tile = isTile(useWidgetFace().cls);
  return (
    <WidgetFrame
      title="Readiness"
      icon="gauge"
      accent="positive"
      href={href.fitnessPage('heart', { day: data.day })}
    >
      {score === null ? (
        <WidgetEmpty
          icon="gauge"
          colour="positive"
          title="Not enough data yet"
          body="Wear your watch overnight to get a score."
        />
      ) : (
        <View className="flex-1 flex-row items-center gap-4">
          <Dial score={score} size={tile ? 88 : 96} />
          {tile ? null : <Reasons score={score} />}
        </View>
      )}
    </WidgetFrame>
  );
}
