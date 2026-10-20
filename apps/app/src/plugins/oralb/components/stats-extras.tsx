import type { BrushingStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { RangeBars } from '../../../components/charts';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useBrushView } from '../../toothbrush/data/brush-data';
import type { StatsProps } from '../../toothbrush/brand-ui';
import { ShareBar } from '../charts/share-bar';
import { FaceStrip } from '../charts/face-strip';
import {
  FORCE_NOTE,
  STRIP_SESSIONS,
  bestRun,
  faceBars,
  facesSummary,
  forceBuckets,
  forceLine,
  pressureShares,
} from '../model/stats-model';

function Faces({
  deviceId,
  stats,
}: {
  readonly deviceId: string;
  readonly stats: BrushingStats;
}): ReactNode {
  const sessions = useBrushView(deviceId, 'sessions', { limit: STRIP_SESSIONS });
  const summary = facesSummary(stats);
  return (
    <Card title="Result faces" icon="circleCheck">
      <LoadedQuery query={sessions}>
        {(loaded) => {
          const bars = faceBars(loaded.sessions);
          const best = bestRun(bars);
          return bars.every((bar) => bar.level === null) ? (
            <Text variant="callout" tone="variant">
              The handle has not shown a face yet.
            </Text>
          ) : (
            <View className="gap-3">
              <FaceStrip bars={bars} />
              <View className="flex-row flex-wrap items-center gap-2">
                {summary === null ? null : <Text variant="callout">{summary}</Text>}
                {best < 2 ? null : (
                  <Badge label={`Best run: ${String(best)} in a row`} tone="positive" />
                )}
              </View>
            </View>
          );
        }}
      </LoadedQuery>
    </Card>
  );
}

function Shares({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const shares = pressureShares(stats);
  if (shares.length === 0) {
    return null;
  }
  return (
    <Card title="Pressure shares" icon="gauge">
      <View className="gap-2">
        <ShareBar shares={shares} />
        {stats.lowPressureShare === null ? (
          <Text variant="caption" tone="faint">
            Light pressure is only counted when the brush is connected.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function Force({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const buckets = forceBuckets(stats);
  const line = forceLine(stats);
  if (line === null) {
    return null;
  }
  return (
    <Card title="Force" icon="gauge">
      <View className="gap-2">
        <RangeBars
          buckets={buckets}
          colour="viz-1"
          label={`Force per period, ${line}`}
          formatValue={(value) => value.toFixed(1)}
        />
        <Text variant="callout">{line}</Text>
        <Text variant="caption" tone="faint">
          {FORCE_NOTE}
        </Text>
      </View>
    </Card>
  );
}

export function OralbStatsExtras({ deviceId, stats }: StatsProps): ReactNode {
  return (
    <>
      <Faces deviceId={deviceId} stats={stats} />
      <Shares stats={stats} />
      <Force stats={stats} />
    </>
  );
}
