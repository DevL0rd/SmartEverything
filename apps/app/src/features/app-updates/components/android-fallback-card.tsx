import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { usePairedAndroidBuilds } from '../data/android-fallbacks';
import { awaitingFallbacks, fallbackLine, type AwaitingFallback } from '../model/android-fallbacks';

function FallbackRow({ fallback }: { readonly fallback: AwaitingFallback }): ReactNode {
  const now = useMinute();
  const name = useStoreSelector(
    (state) => state.tables.clients.byId[fallback.clientId]?.name ?? 'A paired phone',
  );
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {name}
        </Text>
        <View className="flex-1" />
        <Badge label="Awaiting a decision" tone="warning" icon="warning" />
      </View>
      <Text variant="callout" tone="variant" selectable className="web:wrap-anywhere">
        {fallbackLine(fallback)}
      </Text>
      <Text variant="footnote" tone="variant">
        {`Reported ${relative(fallback.recordedAt, now)}`}
      </Text>
    </View>
  );
}

export function AndroidFallbackCard(): ReactNode {
  const builds = usePairedAndroidBuilds().data;
  const waiting = builds === undefined ? [] : awaitingFallbacks(builds);
  if (waiting.length === 0) return null;
  return (
    <Card title="Updates awaiting a decision" icon="alert">
      <View className="gap-4">
        {waiting.map((fallback) => (
          <FallbackRow key={fallback.clientId} fallback={fallback} />
        ))}
      </View>
    </Card>
  );
}
