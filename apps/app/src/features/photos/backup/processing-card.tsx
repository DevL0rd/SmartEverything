import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useDriveItem } from '../../nas/data/queries';
import { usePhotoProcessing } from '../data';
import type { LiveProgress } from './phones-model';
import {
  jobsLeftText,
  processingOf,
  unreadableText,
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
        />
      </View>
      <Text variant="caption" tone="variant" align="end" className="w-28 tabular-nums">
        {row.note}
      </Text>
    </View>
  );
}

function FailedRow({ itemId }: { readonly itemId: string }): ReactNode {
  const name = useDriveItem(itemId, null).data?.name ?? 'File';
  return <ListRow title={name} icon="alert" iconTone="critical" compact />;
}

function Unreadable({ items }: { readonly items: readonly string[] }): ReactNode {
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
      {open ? items.map((itemId) => <FailedRow key={itemId} itemId={itemId} />) : null}
    </View>
  );
}

function ProcessingBody({ view }: { readonly view: ProcessingView }): ReactNode {
  return (
    <View className="gap-3">
      {view.rows.map((row) => (
        <KindLine key={row.key} row={row} />
      ))}
      {view.failedItems.length === 0 ? null : <Unreadable items={view.failedItems} />}
    </View>
  );
}

function StateBadge({ left }: { readonly left: number }): ReactNode {
  return left === 0 ? (
    <Badge label="Done" tone="positive" icon="check" />
  ) : (
    <Badge label="Working" tone="primary" icon="refresh" />
  );
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

export function ProcessingCard({ live }: { readonly live: LiveProgress }): ReactNode {
  const query = usePhotoProcessing();
  const processing = query.data;
  const view = processing === undefined ? undefined : processingOf(processing, live.kinds);
  return (
    <Card
      title="Processing"
      action={view === undefined ? null : <StateBadge left={view.left} />}
      metadata={
        view === undefined ? null : (
          <Text variant="caption" tone="variant" className="tabular-nums">
            {jobsLeftText(view.left)}
          </Text>
        )
      }
    >
      {view === undefined ? <Missing query={query} /> : <ProcessingBody view={view} />}
    </Card>
  );
}
