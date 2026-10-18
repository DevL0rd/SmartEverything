import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { percent } from '../../../format/number';
import { plural } from '../../../format/text';
import { baseName } from './file-model';
import type { UploadItem, UploadQueue } from './upload-queue';

const ACTIVE = new Set(['waiting', 'conflict', 'uploading']);

function uploadStateText(item: UploadItem): string {
  switch (item.state) {
    case 'waiting':
      return 'Waiting';
    case 'conflict':
      return 'Already exists';
    case 'uploading':
      return percent(item.progress);
    case 'done':
      return 'Done';
    case 'failed':
      return item.error ?? 'Failed';
    case 'skipped':
      return 'Skipped';
    case 'cancelled':
      return 'Cancelled';
  }
}

function Choices({
  item,
  queue,
}: {
  readonly item: UploadItem;
  readonly queue: UploadQueue;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Replace"
        variant="tonal"
        onPress={() => {
          queue.decide(item.id, 'replace');
        }}
      />
      <Button
        label="Keep both"
        variant="tonal"
        onPress={() => {
          queue.decide(item.id, 'both');
        }}
      />
      <Button
        label="Skip"
        variant="tonal"
        onPress={() => {
          queue.decide(item.id, 'skip');
        }}
      />
    </View>
  );
}

function Item({
  item,
  queue,
}: {
  readonly item: UploadItem;
  readonly queue: UploadQueue;
}): ReactNode {
  const active = ACTIVE.has(item.state);
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
          {item.target}
        </Text>
        <Text
          variant="caption"
          tone={item.state === 'failed' ? 'critical' : 'variant'}
          numberOfLines={2}
          className="tabular shrink"
        >
          {uploadStateText(item)}
        </Text>
        {active ? (
          <Button
            label="Cancel"
            variant="text"
            onPress={() => {
              queue.cancel(item.id);
            }}
          />
        ) : null}
      </View>
      <ProgressBar
        progress={item.progress}
        colour={item.state === 'failed' ? 'critical' : 'primary'}
        label={`${item.target} upload`}
      />
      {item.state === 'conflict' ? <Choices item={item} queue={queue} /> : null}
    </View>
  );
}

function Footer({
  live,
  sourceWord,
  queue,
  onPick,
}: {
  readonly live: number;
  readonly sourceWord: string;
  readonly queue: UploadQueue;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={`Choose files on ${sourceWord}`}
        icon="upload"
        variant="tonal"
        onPress={onPick}
      />
      {live > 1 ? (
        <Button
          label="Cancel all"
          variant="text"
          onPress={() => {
            queue.cancelAll();
          }}
        />
      ) : null}
    </View>
  );
}

export function UploadSheet({
  queue,
  machine,
  folder,
  sourceWord,
  open,
  onPick,
  onClose,
}: {
  readonly queue: UploadQueue;
  readonly machine: string;
  readonly folder: string;
  readonly sourceWord: string;
  readonly open: boolean;
  readonly onPick: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const items = useValue(queue.items);
  const live = items.filter((item) => ACTIVE.has(item.state)).length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Upload to ${machine} / ${baseName(folder)}`}
      detents={['half', 'full']}
    >
      <View className="gap-4 px-4 pb-6">
        <Text variant="footnote" tone="variant">
          {live === 0
            ? `Choose files on ${sourceWord} to send to ${folder} on ${machine}.`
            : `${plural(live, 'file')} left, going to ${folder} on ${machine}`}
        </Text>
        {items.map((item) => (
          <Item key={item.id} item={item} queue={queue} />
        ))}
        <Footer live={live} sourceWord={sourceWord} queue={queue} onPick={onPick} />
      </View>
    </Sheet>
  );
}
