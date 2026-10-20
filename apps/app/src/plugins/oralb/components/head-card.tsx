import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { LoadedQuery } from '../../../components/loaded-query';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { TimelineStrip } from '../../toothbrush/charts/care-charts';
import { useBrushView } from '../../toothbrush/data/brush-data';
import { replaceByText, timelineBars } from '../../toothbrush/model/care-model';
import { DaysLine } from '../charts/days-line';
import { HeadRing } from '../charts/head-ring';
import { useOralbConfig } from '../data/use-oralb';
import { HeadActions } from './head-actions';
import {
  countdownOf,
  countedFrom,
  daysSeriesOf,
  reminderTone,
  reminderWord,
} from '../model/care-model';
import { Text } from '../../../components/text';

function Chips({
  reminder,
  replace,
}: {
  readonly reminder: Parameters<typeof reminderWord>[0];
  readonly replace: string | null;
}): ReactNode {
  const word = reminderWord(reminder);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {replace === null ? null : <Badge label={`Replace by ${replace}`} icon="calendar" />}
      {word === null ? null : <Badge label={word} tone={reminderTone(reminder)} />}
    </View>
  );
}

export function OralbHeadCard({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const head = useBrushView(deviceId, 'head');
  const { oralb } = useOralbConfig(deviceId);
  const now = useMinute();
  const wide = atLeast(useSizeClass().width, 'medium');
  return (
    <Card title="Brush head" icon="toothbrush">
      <LoadedQuery query={head}>
        {(loaded) => {
          const countdown = countdownOf(loaded.head, {
            warnDays: oralb.headWarnDays,
            dueDays: oralb.headDueDays,
          });
          const series = daysSeriesOf(loaded.timeline, now);
          return (
            <View className="gap-4">
              <View className={cn('gap-4', wide ? 'flex-row items-center' : 'items-center')}>
                <HeadRing countdown={countdown} />
                <View className="min-w-0 flex-1 gap-3 self-stretch">
                  <Chips
                    reminder={loaded.head.reminder}
                    replace={replaceByText(loaded.head.replaceBy)}
                  />
                  <HeadActions deviceId={deviceId} view={view} right={wide} />
                </View>
              </View>
              <DaysLine series={series} />
              {loaded.timeline.length < 2 ? null : (
                <TimelineStrip bars={timelineBars(loaded.timeline)} />
              )}
              <Text variant="footnote" tone="variant">
                {countedFrom(loaded.timeline.length > 1)}
              </Text>
            </View>
          );
        }}
      </LoadedQuery>
    </Card>
  );
}
