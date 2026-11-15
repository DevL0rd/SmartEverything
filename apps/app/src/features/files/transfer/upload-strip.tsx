import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Banner } from '../../../components/banner';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { nodeIconOf } from '../picker/picker-model';
import { kindOfFile } from '../source/node';
import { conflictLineOf, conflictTitleOf } from './conflict-model';
import { headActionOf, retryBodyOf, rowEndOf, shownRowsOf } from './strip-model';
import type { UploadItem, UploadQueue } from './upload-queue';
import {
  amountOf,
  failureLineOf,
  headlineOf,
  isActive,
  itemsIn,
  leftText,
  nextClock,
  overallProgress,
  progressOf,
  rateText,
  retryNoticeOf,
  storedAsText,
  summaryOf,
  type RateClock,
  type UploadSummary,
} from './upload-summary';

interface Lane {
  readonly queue: UploadQueue;
  readonly resume: boolean;
}

function useRate(queue: UploadQueue, folderKey: string): number | null {
  const [clock, setClock] = useState<RateClock | undefined>(undefined);
  useEffect(
    () =>
      queue.items.subscribe(() => {
        const summary = summaryOf(itemsIn(queue.items.get(), folderKey));
        setClock((current) => nextClock(current, summary.sending > 0, summary.sent, Date.now()));
      }),
    [queue, folderKey],
  );
  return clock?.rate ?? null;
}

function Controls({
  item,
  lane,
  pausable,
}: {
  readonly item: UploadItem;
  readonly lane: Lane;
  readonly pausable: boolean;
}): ReactNode {
  const paused = item.state === 'paused';
  const moving = item.state === 'sending' || paused;
  return (
    <View className="flex-row items-center gap-1">
      {moving ? (
        <View className="w-20">
          <ProgressBar progress={progressOf(item)} colour="primary" label={`${item.name} upload`} />
        </View>
      ) : null}
      {pausable ? (
        <IconButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? `Resume ${item.name}` : `Pause ${item.name}`}
          onPress={() => {
            if (paused) lane.queue.resume(item.id);
            else lane.queue.pause(item.id);
          }}
        />
      ) : null}
      <IconButton
        icon="close"
        label={`Cancel ${item.name}`}
        onPress={() => {
          lane.queue.cancel(item.id);
        }}
      />
    </View>
  );
}

function RowEnd({ item, lane }: { readonly item: UploadItem; readonly lane: Lane }): ReactNode {
  const end = rowEndOf(item, lane.resume);
  switch (end.kind) {
    case 'controls':
      return <Controls item={item} lane={lane} pausable={end.pausable} />;
    case 'done':
      return end.storedAs === null ? (
        <View className="flex-row items-center gap-1">
          <Icon name="check" size={16} tone="positive" />
          <Text variant="footnote" tone="positive">
            Done
          </Text>
        </View>
      ) : (
        <Text variant="footnote" tone="warning" numberOfLines={1} className="shrink">
          {storedAsText(end.storedAs)}
        </Text>
      );
    case 'have':
      return (
        <Text variant="footnote" tone="variant">
          Already here
        </Text>
      );
    case 'failed':
      return end.retryable ? (
        <IconButton
          icon="refresh"
          label={`Try ${item.name} again`}
          onPress={() => {
            lane.queue.retry(item.id);
          }}
        />
      ) : (
        <Icon name="alert" size={16} tone="critical" />
      );
    case 'none':
      return (
        <Text variant="footnote" tone="variant">
          Skipped
        </Text>
      );
  }
}

function StripRow({
  item,
  lane,
  folder,
}: {
  readonly item: UploadItem;
  readonly lane: Lane;
  readonly folder: string;
}): ReactNode {
  const failure = failureLineOf(item);
  const conflict = conflictLineOf(item, folder);
  return (
    <View className="min-h-12 flex-row items-center gap-3 py-1">
      <Icon name={nodeIconOf(kindOfFile(item.file.mime, item.name))} size={20} tone="variant" />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {item.name}
        </Text>
        {item.state === 'waiting' ? (
          <Text variant="footnote" tone="variant">
            Waiting
          </Text>
        ) : null}
        {conflict === null ? null : (
          <Text variant="footnote" tone="warning">
            {conflict}
          </Text>
        )}
        {failure === null ? null : (
          <Text variant="footnote" tone="critical">
            {failure}
          </Text>
        )}
      </View>
      <RowEnd item={item} lane={lane} />
    </View>
  );
}

function HeadActions({
  items,
  summary,
  lane,
  folderKey,
  open,
  onToggle,
}: {
  readonly items: readonly UploadItem[];
  readonly summary: UploadSummary;
  readonly lane: Lane;
  readonly folderKey: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const action = headActionOf(summary, lane.resume);
  return (
    <View className="flex-row items-center gap-1">
      {action === 'pause' || action === 'resume' ? (
        <IconButton
          icon={action === 'resume' ? 'play' : 'pause'}
          label={action === 'resume' ? 'Resume uploads' : 'Pause uploads'}
          onPress={() => {
            for (const item of items) {
              if (action === 'resume') lane.queue.resume(item.id);
              else lane.queue.pause(item.id);
            }
          }}
        />
      ) : null}
      {action === 'close' ? (
        <IconButton
          icon="close"
          label="Close uploads"
          onPress={() => {
            lane.queue.clearSettled(folderKey);
          }}
        />
      ) : null}
      <IconButton
        icon={open ? 'chevronDown' : 'chevronUp'}
        label={open ? 'Collapse uploads' : 'Expand uploads'}
        onPress={onToggle}
      />
    </View>
  );
}

function AmountLine({
  summary,
  rate,
}: {
  readonly summary: UploadSummary;
  readonly rate: number | null;
}): ReactNode {
  const left = leftText(summary, rate);
  return (
    <View className="flex-row items-center gap-3">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular min-w-0 flex-1">
        {left === null ? amountOf(summary) : `${amountOf(summary)} · ${left}`}
      </Text>
      {rate !== null && summary.sending > 0 ? (
        <Text variant="footnote" tone="variant" className="tabular">
          {rateText(rate)}
        </Text>
      ) : null}
    </View>
  );
}

function RetryNotice({
  items,
  lane,
}: {
  readonly items: readonly UploadItem[];
  readonly lane: Lane;
}): ReactNode {
  const notice = retryNoticeOf(items);
  if (notice === null) return null;
  return (
    <Banner
      wrapBody
      tone="warning"
      title={notice.title}
      body={retryBodyOf(lane.resume)}
      action={{
        label: 'Retry now',
        onPress: () => {
          for (const item of items) if (item.retryable) lane.queue.retry(item.id);
        },
      }}
    />
  );
}

export interface UploadStripProps {
  readonly queue: UploadQueue;
  readonly folderKey: string;
  readonly folder: string;
  readonly resume: boolean;
  readonly onConflicts?: (() => void) | undefined;
}

function Notices({
  items,
  summary,
  lane,
  folder,
  onConflicts,
}: {
  readonly items: readonly UploadItem[];
  readonly summary: UploadSummary;
  readonly lane: Lane;
  readonly folder: string;
  readonly onConflicts: (() => void) | undefined;
}): ReactNode {
  return (
    <>
      {summary.conflicts > 0 && onConflicts !== undefined ? (
        <Banner
          wrapBody
          tone="warning"
          title={conflictTitleOf(summary.conflicts, folder)}
          body="Choose whether to replace them, keep both or skip them."
          action={{ label: 'Choose', onPress: onConflicts }}
        />
      ) : null}
      <RetryNotice items={items} lane={lane} />
    </>
  );
}

export function UploadStrip(props: UploadStripProps): ReactNode {
  const { queue, folderKey, folder } = props;
  const [open, setOpen] = useState(true);
  const items = itemsIn(useValue(queue.items), folderKey);
  const rate = useRate(queue, folderKey);
  const rows = shownRowsOf(items);
  if (rows.length === 0) return null;
  const summary = summaryOf(items);
  const lane = { queue, resume: props.resume };
  return (
    <View className="gap-2 border-t border-outline-variant px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Icon name="upload" size={20} tone="primary" />
        <Text variant="body-strong" numberOfLines={1} className="tabular min-w-0 flex-1">
          {headlineOf(summary, folder)}
        </Text>
        <HeadActions
          items={items}
          summary={summary}
          lane={lane}
          folderKey={folderKey}
          open={open}
          onToggle={() => {
            setOpen((current) => !current);
          }}
        />
      </View>
      <Notices
        items={items}
        summary={summary}
        lane={lane}
        folder={folder}
        onConflicts={props.onConflicts}
      />
      {isActive(summary) ? (
        <>
          <ProgressBar progress={overallProgress(summary)} colour="primary" label="Uploads" />
          <AmountLine summary={summary} rate={rate} />
        </>
      ) : null}
      {open ? (
        <ScrollView className="max-h-60">
          {rows.map((item) => (
            <StripRow key={item.id} item={item} lane={lane} folder={folder} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
