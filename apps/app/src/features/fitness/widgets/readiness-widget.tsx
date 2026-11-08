import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Gauge, type GaugeBand } from '../../../components/charts';
import { Text } from '../../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  widgetBodyHeight,
  type WidgetFrameBox,
} from '../../../components/widget-board';
import { isTile } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useReadiness } from '../data/readiness';
import { useTodayContext } from '../data/today';
import { TYPE_SCALE } from '../../../design/tokens';
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

const REASON_GAP = 2;

export function reasonsThatFit(frame: WidgetFrameBox, columns: number, total: number): number {
  const type = TYPE_SCALE[frame.idiom];
  const room = widgetBodyHeight(frame) - type.body[1];
  const lines = Math.max(0, Math.floor(room / (type.footnote[1] + REASON_GAP)));
  return Math.min(total, lines * columns);
}

function Reasons({
  score,
  columns,
}: {
  readonly score: Score;
  readonly columns: number;
}): ReactNode {
  const { frame } = useWidgetFace();
  const shown = score.parts.slice(0, reasonsThatFit(frame, columns, score.parts.length));
  return (
    <View className="min-w-0 flex-1 gap-0.5 self-stretch">
      <Text variant="body-strong">{readinessWord(score.value)}</Text>
      <View className="flex-row flex-wrap gap-y-0.5">
        {shown.map((part) => (
          <View key={part.key} className={columns > 1 ? 'w-1/2 pr-3' : 'w-full'}>
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {`${part.label}: ${part.explanation}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReadinessWidget(): ReactNode {
  const data = useTodayContext();
  const score = useReadiness(data);
  const { cls, frame } = useWidgetFace();
  const tile = isTile(cls);
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
        <View className="flex-1 flex-row items-start gap-4">
          <Dial score={score} size={Math.floor(widgetBodyHeight(frame))} />
          {tile ? null : <Reasons score={score} columns={cls === 'w' ? 2 : 1} />}
        </View>
      )}
    </WidgetFrame>
  );
}
