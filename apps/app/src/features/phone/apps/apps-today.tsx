import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar, Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { hoursMinutes } from '../../../format/time';
import type { TodayApp } from '../model/apps-model';
import { bodyWidthOf } from '../model/sections';
import { AppIcon } from './app-icon';

const SPARK_HEIGHT = 22;
const WIDE_BODY = 560;

function spokenToday(app: TodayApp): string {
  return `${app.label}, ${hoursMinutes(app.minutesToday)} today`;
}

function TodayRow({ app, trend }: { readonly app: TodayApp; readonly trend: boolean }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={spokenToday(app)}
      className="min-h-row-h flex-row items-center gap-3"
    >
      <AppIcon label={app.label} iconHash={app.iconHash} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" ellipsize="middle">
          {app.label}
        </Text>
        <ProgressBar progress={app.share} colour="viz-1" label={app.label} />
      </View>
      {trend ? (
        <View aria-hidden className="w-16">
          <Sparkline
            points={app.minutesByDay.map((value, index) => ({ t: index, v: value }))}
            colour="on-surface-variant"
            height={SPARK_HEIGHT}
          />
        </View>
      ) : null}
      <Text variant="callout" tone="variant" className="tabular w-20 text-right">
        {hoursMinutes(app.minutesToday)}
      </Text>
    </View>
  );
}

export function AppsToday({
  apps,
  front,
}: {
  readonly apps: readonly TodayApp[];
  readonly front: string | null;
}): ReactNode {
  const trend = bodyWidthOf(useAreaWidth()) >= WIDE_BODY;
  return (
    <Card title="Used today" icon="activity">
      <View className="gap-1">
        {front === null ? null : (
          <Text variant="footnote" tone="variant">
            {`Using ${front} now`}
          </Text>
        )}
        {apps.length === 0 ? (
          <Text variant="callout" tone="variant">
            No app has been used yet today.
          </Text>
        ) : (
          apps.map((app) => <TodayRow key={app.package} app={app} trend={trend} />)
        )}
      </View>
    </Card>
  );
}
