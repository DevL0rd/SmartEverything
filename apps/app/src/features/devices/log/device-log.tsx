import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceLogEntry } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { CauseChip } from './cause-chip';
import { effectIcon, effectText, effectTone, pageTime } from './log-model';
import { useDeviceLogPages } from './use-device-log';

const EMPTY_TEXT = 'Nothing yet. Changes, presses and runs show up here.';

function Effects({ entry }: { readonly entry: DeviceLogEntry }): ReactNode {
  return (
    <>
      {(entry.effects ?? []).map((effect) => (
        <View
          key={`${effect.automationId}-${effect.outcome}`}
          className="basis-full flex-row items-center gap-1.5 pl-18"
        >
          <Icon
            name={effectIcon(effect)}
            size={16}
            tone={effect.outcome === 'ok' ? 'positive' : effectTone(effect)}
          />
          <Text variant="caption" tone={effectTone(effect)} numberOfLines={2}>
            {effectText(effect)}
          </Text>
        </View>
      ))}
    </>
  );
}

function Row({
  entry,
  now,
  first,
}: {
  readonly entry: DeviceLogEntry;
  readonly now: number;
  readonly first: boolean;
}): ReactNode {
  return (
    <View
      role="listitem"
      className={cn(
        'flex-row flex-wrap items-center gap-x-2 gap-y-1 py-2.5',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <View className="w-16 shrink-0">
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {pageTime(entry.at, now)}
        </Text>
      </View>
      <View className="min-w-32 flex-1 gap-px">
        <Text variant="callout">{entry.title}</Text>
        {entry.value === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {entry.value}
          </Text>
        )}
      </View>
      <CauseChip cause={entry.cause} />
      <Effects entry={entry} />
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View className="gap-3 py-2" aria-busy>
      <Skeleton shape="line" />
      <Skeleton shape="line" />
      <Skeleton shape="line" />
    </View>
  );
}

export function DeviceLog({
  deviceId,
  label = 'Activity',
}: {
  readonly deviceId: string;
  readonly label?: string;
}): ReactNode {
  const log = useDeviceLogPages(deviceId);
  const now = useMinute();
  if (log.failure !== null && log.entries.length === 0) {
    return <ErrorState error={log.failure} retry={log.retry} />;
  }
  if (log.loading) {
    return <Loading />;
  }
  if (log.entries.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        {EMPTY_TEXT}
      </Text>
    );
  }
  return (
    <View className="min-w-0">
      <View role="list" aria-label={label}>
        {log.entries.map((entry, index) => (
          <Row
            key={`${entry.at}-${entry.kind}-${entry.title}`}
            entry={entry}
            now={now}
            first={index === 0}
          />
        ))}
      </View>
      {log.more ? (
        <Button label="Show more" variant="text" loading={log.loadingMore} onPress={log.loadMore} />
      ) : null}
    </View>
  );
}
