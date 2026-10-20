import type { PrinterJob } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { countLabel } from '../model/format';
import { jobCardOf } from '../model/job-card';
import { titleOf, type JobHandlers } from './job-card';

const SHOWN = 5;

export interface WaitingEntry {
  readonly job: PrinterJob;
  readonly handlers: JobHandlers;
}

function WaitingRow({
  entry,
  first,
}: {
  readonly entry: WaitingEntry;
  readonly first: boolean;
}): ReactNode {
  const { job, handlers } = entry;
  const card = jobCardOf(job, { stopped: false, now: 0, ppm: null });
  const title = titleOf(job);
  const hold = job.state === 'pending' ? handlers.onHold : null;
  const release = job.state === 'held' ? handlers.onRelease : null;
  return (
    <View
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 py-1',
        !first && 'border-t border-outline-variant',
      )}
    >
      <Icon name="fileText" tone="variant" />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {card.detail ?? card.headline}
        </Text>
      </View>
      {card.kind === 'held' ? <Badge label="On hold" tone="warning" /> : null}
      {hold === null ? null : <IconButton icon="pause" label={`Hold ${title}`} onPress={hold} />}
      {release === null ? null : (
        <IconButton icon="play" label={`Print ${title} now`} onPress={release} />
      )}
      {handlers.onCancel === null ? null : (
        <IconButton
          icon="close"
          label={`Cancel ${title}`}
          tone="critical"
          onPress={handlers.onCancel}
        />
      )}
    </View>
  );
}

export function WaitingList({ entries }: { readonly entries: readonly WaitingEntry[] }): ReactNode {
  if (entries.length === 0) return null;
  const hidden = entries.length - SHOWN;
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        Up next · {countLabel(entries.length, 'job')}
      </Text>
      <View className="rounded-lg border border-outline-variant px-3">
        {entries.slice(0, SHOWN).map((entry, index) => (
          <WaitingRow key={entry.job.key} entry={entry} first={index === 0} />
        ))}
      </View>
      {hidden > 0 ? (
        <Text variant="caption" tone="faint">
          And {countLabel(hidden, 'more job')} waiting
        </Text>
      ) : null}
    </View>
  );
}
