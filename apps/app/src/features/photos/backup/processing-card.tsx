import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import { ProgressBar } from '../../../components/charts';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useDriveItem } from '../../drive';
import { usePhotoProcessing } from '../data';
import { useKindProgress } from './live';
import {
  failedBadgeText,
  jobsLeftText,
  processingOf,
  queueText,
  unreadableText,
  type FailedItem,
  type ProcessingQueue,
  type ProcessingRow,
  type ProcessingView,
} from './stats-model';

function KindLine({ row }: { readonly row: ProcessingRow }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Text variant="footnote" numberOfLines={1} className="w-40">
        {row.label}
      </Text>
      <View className="min-w-0 flex-1">
        <ProgressBar
          progress={row.progress}
          colour={row.done ? 'positive' : 'primary'}
          label={`${row.label}: ${row.note}`}
          ticking={false}
        />
      </View>
      <Text variant="caption" tone="variant" align="end" className="w-28 tabular-nums">
        {row.note}
      </Text>
    </View>
  );
}

function FailedName({ itemId }: { readonly itemId: string }): ReactNode {
  const query = useDriveItem(itemId, null);
  if (query.data !== undefined) {
    return (
      <Text variant="footnote" numberOfLines={1}>
        {query.data.name}
      </Text>
    );
  }
  if (query.isError) {
    return (
      <Text variant="footnote" tone="critical" numberOfLines={1}>
        The file details did not load
      </Text>
    );
  }
  return <Skeleton shape="text" />;
}

function FailedRow({ item }: { readonly item: FailedItem }): ReactNode {
  return (
    <Interactive
      href={href.photosItem(item.itemId)}
      label={`Open the file that failed: ${item.error}`}
      className="min-h-touch-min flex-row items-center gap-3 rounded-md px-3 py-2"
      layerClassName="rounded-md"
    >
      <Icon name="alert" size={16} tone="critical" />
      <View className="min-w-0 flex-1 gap-0.5">
        <FailedName itemId={item.itemId} />
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {item.error}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} tone="faint" />
    </Interactive>
  );
}

function QueueLine({
  queue,
  left,
}: {
  readonly queue: ProcessingQueue;
  readonly left: number;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-3">
      <Icon name="refresh" size={16} tone="primary" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="footnote" className="tabular-nums">
          {`${jobsLeftText(left)} · ${queueText(queue)}`}
        </Text>
        <Text variant="caption" tone="variant">
          Items on screen in Photos are processed first.
        </Text>
      </View>
    </View>
  );
}

function Unreadable({ items }: { readonly items: readonly FailedItem[] }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-3 rounded-md bg-critical/14 px-3 py-2">
        <Icon name="warning" size={16} tone="critical" />
        <Text variant="footnote" className="min-w-0 flex-1">
          {unreadableText(items.length)}
        </Text>
        <Button
          label={open ? 'Hide' : 'Show'}
          variant="text"
          onPress={() => {
            setOpen((current) => !current);
          }}
        />
      </View>
      {open ? items.map((item) => <FailedRow key={item.itemId} item={item} />) : null}
    </View>
  );
}

function ProcessingBody({ view }: { readonly view: ProcessingView }): ReactNode {
  const quiet = view.queue === null && view.rows.length === 0 && view.failedItems.length === 0;
  return (
    <View className="gap-3">
      {view.queue === null ? null : <QueueLine queue={view.queue} left={view.left} />}
      {quiet ? (
        <Text variant="footnote" tone="variant">
          {jobsLeftText(0)}
        </Text>
      ) : null}
      {view.rows.map((row) => (
        <KindLine key={row.key} row={row} />
      ))}
      {view.failedItems.length === 0 ? null : <Unreadable items={view.failedItems} />}
    </View>
  );
}

function StateBadge({ view }: { readonly view: ProcessingView }): ReactNode {
  if (view.left > 0) return <Badge label="Working" tone="primary" icon="refresh" />;
  if (view.failedItems.length > 0) {
    return <Badge label={failedBadgeText(view.failedItems.length)} tone="critical" icon="alert" />;
  }
  return <Badge label="Done" tone="positive" icon="check" />;
}

function Missing({ query }: { readonly query: ReturnType<typeof usePhotoProcessing> }): ReactNode {
  if (!query.isError) return <Skeleton shape="text" />;
  return (
    <ErrorState
      error={query.error}
      retry={() => {
        background(query.refetch(), 'photos.backup.processing_refetch_failed');
      }}
    />
  );
}

export function ProcessingCard(): ReactNode {
  const kinds = useKindProgress();
  const query = usePhotoProcessing();
  const processing = query.data;
  const view = processing === undefined ? undefined : processingOf(processing, kinds);
  return (
    <Card title="Processing" action={view === undefined ? null : <StateBadge view={view} />}>
      {view === undefined ? <Missing query={query} /> : <ProcessingBody view={view} />}
    </Card>
  );
}
