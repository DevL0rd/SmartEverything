import type { PrinterJob } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSecondOf } from '../../../store/clock';
import { jobCardOf, type JobCard as Card } from '../model/job-card';

export interface JobHandlers {
  readonly onCancel: (() => void) | null;
  readonly onHold: (() => void) | null;
  readonly onRelease: (() => void) | null;
}

export interface JobCardProps extends JobHandlers {
  readonly job: PrinterJob;
  readonly stopped: boolean;
  readonly ppm: number | null;
}

export function titleOf(job: PrinterJob): string {
  if (job.name !== null && job.name !== '') return job.name;
  return job.mine ? 'Your document' : 'A document';
}

function factsOf(job: PrinterJob): string {
  return [
    job.person,
    job.sheets === null ? null : `${String(job.sheets)} sheets`,
    job.duplex === true ? 'Two-sided' : null,
    job.copies !== null && job.copies > 1 ? `${String(job.copies)} copies` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function Times({ card }: { readonly card: Card }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-4">
      {card.elapsed === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {card.elapsed} elapsed
        </Text>
      )}
      {card.remaining === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {card.remaining}
        </Text>
      )}
    </View>
  );
}

function holdsOf(
  job: PrinterJob,
  { onHold, onRelease }: JobHandlers,
): { readonly hold: (() => void) | null; readonly release: (() => void) | null } {
  return {
    hold: job.state === 'pending' ? onHold : null,
    release: job.state === 'held' ? onRelease : null,
  };
}

function Actions({
  job,
  handlers,
}: {
  readonly job: PrinterJob;
  readonly handlers: JobHandlers;
}): ReactNode {
  const { onCancel } = handlers;
  const { hold, release } = holdsOf(job, handlers);
  if (hold === null && release === null && onCancel === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2 pt-1">
      {hold === null ? null : (
        <Button label="Hold for later" variant="tonal" icon="pause" onPress={hold} />
      )}
      {release === null ? null : (
        <Button label="Print now" variant="tonal" icon="play" onPress={release} />
      )}
      {onCancel === null ? null : (
        <View className="ml-auto">
          <Button label="Cancel job" icon="close" variant="destructive" onPress={onCancel} />
        </View>
      )}
    </View>
  );
}

function Body({
  job,
  card,
  handlers,
}: {
  readonly job: PrinterJob;
  readonly card: Card;
  readonly handlers: JobHandlers;
}): ReactNode {
  const frozen = card.kind === 'stopped';
  const facts = factsOf(job);
  return (
    <>
      <Text variant="callout" tone={frozen ? 'critical' : 'default'}>
        {card.headline}
      </Text>
      {card.progress === null ? null : (
        <ProgressBar
          progress={card.progress}
          colour={frozen ? 'critical' : 'primary'}
          label="Job progress"
        />
      )}
      <Times card={card} />
      {card.detail === null ? null : (
        <Text variant="caption" tone="variant">
          {card.detail}
        </Text>
      )}
      {facts === '' ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {facts}
        </Text>
      )}
      <Actions job={job} handlers={handlers} />
    </>
  );
}

export function JobCard({ job, stopped, ppm, ...handlers }: JobCardProps): ReactNode {
  const now = useSecondOf((value) => value, !stopped && job.state === 'processing');
  const card = jobCardOf(job, { stopped, now, ppm });
  const frozen = card.kind === 'stopped';
  return (
    <View
      className={cn(
        'gap-2 rounded-lg border bg-surface-2 p-3',
        frozen ? 'border-critical' : 'border-outline-variant',
      )}
      accessible
      accessibilityLabel={`${titleOf(job)}. ${card.headline}${card.remaining ?? ''}`}
    >
      <View className="flex-row items-center gap-2">
        <Icon name={frozen ? 'warning' : 'fileText'} tone={frozen ? 'critical' : 'variant'} />
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {titleOf(job)}
        </Text>
        {card.kind === 'held' ? <Badge label="On hold" tone="warning" /> : null}
      </View>
      <Body job={job} card={card} handlers={handlers} />
    </View>
  );
}
