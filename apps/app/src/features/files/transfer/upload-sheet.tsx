import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { isNative } from '../../../design/platform';
import {
  allChoicesOf,
  choicesOf,
  conflictLineOf,
  decideAll,
  itemStateTextOf,
  liveCountOf,
  sheetLineOf,
} from './conflict-model';
import { shownRowsOf } from './strip-model';
import type { UploadItem, UploadQueue } from './upload-queue';
import { itemsIn, progressOf } from './upload-summary';

function Choices({
  item,
  queue,
  folder,
}: {
  readonly item: UploadItem;
  readonly queue: UploadQueue;
  readonly folder: string;
}): ReactNode {
  const choices = choicesOf(item);
  if (choices.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="warning">
        {conflictLineOf(item, folder)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {choices.map((spec) => (
          <Button
            key={spec.choice}
            label={spec.label}
            variant="tonal"
            onPress={() => {
              queue.decide(item.id, spec.choice);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function ItemAction({
  item,
  queue,
}: {
  readonly item: UploadItem;
  readonly queue: UploadQueue;
}): ReactNode {
  if (liveCountOf([item]) > 0) {
    return (
      <Button
        label="Cancel"
        variant="text"
        onPress={() => {
          queue.cancel(item.id);
        }}
      />
    );
  }
  if (item.state !== 'failed' || !item.retryable) return null;
  return (
    <Button
      label="Try again"
      variant="text"
      onPress={() => {
        queue.retry(item.id);
      }}
    />
  );
}

function Item({
  item,
  queue,
  folder,
}: {
  readonly item: UploadItem;
  readonly queue: UploadQueue;
  readonly folder: string;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
          {item.name}
        </Text>
        <Text
          variant="caption"
          tone={item.state === 'failed' ? 'critical' : 'variant'}
          numberOfLines={2}
          className="tabular shrink"
        >
          {itemStateTextOf(item)}
        </Text>
        <ItemAction item={item} queue={queue} />
      </View>
      <ProgressBar
        progress={progressOf(item)}
        colour={item.state === 'failed' ? 'critical' : 'primary'}
        label={`${item.name} upload`}
        ticking={false}
      />
      <Choices item={item} queue={queue} folder={folder} />
    </View>
  );
}

function AllChoices({
  items,
  queue,
}: {
  readonly items: readonly UploadItem[];
  readonly queue: UploadQueue;
}): ReactNode {
  const choices = allChoicesOf(items);
  if (choices.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2 border-b border-outline-variant pb-4">
      {choices.map((spec) => (
        <Button
          key={spec.choice}
          label={spec.label}
          variant="outlined"
          onPress={() => {
            decideAll(queue, items, spec.choice);
          }}
        />
      ))}
    </View>
  );
}

export interface UploadSheetProps {
  readonly queue: UploadQueue;
  readonly folderKey: string;
  readonly folder: string;
  readonly open: boolean;
  readonly onPick: () => void;
  readonly onClose: () => void;
}

export function UploadSheet(props: UploadSheetProps): ReactNode {
  const { queue, folder, onPick } = props;
  const value = useValue(queue.items);
  const items = itemsIn(value, props.folderKey);
  const rows = shownRowsOf(items);
  const from = isNative() ? 'this phone' : 'this device';
  const live = liveCountOf(items);
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={`Upload to ${folder}`}
      detents={['half', 'full']}
    >
      <View className="gap-4 px-4 pb-6">
        <Text variant="footnote" tone="variant">
          {sheetLineOf(items, folder, from)}
        </Text>
        <AllChoices items={items} queue={queue} />
        {rows.map((item) => (
          <Item key={item.id} item={item} queue={queue} folder={folder} />
        ))}
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={`Choose files on ${from}`}
            icon="upload"
            variant="tonal"
            onPress={onPick}
          />
          {live > 1 ? (
            <Button
              label="Cancel all"
              variant="text"
              onPress={() => {
                for (const item of items) queue.cancel(item.id);
              }}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
