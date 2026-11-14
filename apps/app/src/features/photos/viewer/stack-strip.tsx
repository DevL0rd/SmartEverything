import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { Stack } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useDriveItem, useDriveLink } from '../../drive';
import { usePhotoStack } from '../data/queries';
import { isMediaItem, isRaw } from './info-model';

export function stackCaption(stack: Stack): string {
  const shots = `${String(stack.itemIds.length)} shots`;
  return stack.kind === 'raw_jpeg' ? `RAW and JPEG · ${shots}` : `Stack · ${shots}`;
}

interface Shot {
  readonly name: string;
  readonly url: string | null;
  readonly raw: boolean;
}

function useShot(itemId: string): Shot {
  const item = useDriveItem(itemId, null).data;
  const url = useDriveLink(item === undefined ? null : itemId, item?.rev ?? 1, 'thumb');
  if (item === undefined) return { name: 'Shot in this stack', url, raw: false };
  return { name: item.name, url, raw: isMediaItem(item) && isRaw(item) };
}

function Thumb({
  itemId,
  current,
  compact,
  onOpen,
}: {
  readonly itemId: string;
  readonly current: boolean;
  readonly compact: boolean;
  readonly onOpen: (itemId: string) => void;
}): ReactNode {
  const { name, url, raw } = useShot(itemId);
  return (
    <Interactive
      label={name}
      selected={current}
      onPress={() => {
        onOpen(itemId);
      }}
      className={cn(
        'overflow-hidden rounded-sm bg-surface-3',
        compact ? 'size-11' : 'h-10 w-14',
        current ? 'border-2 border-on-surface' : 'opacity-80',
      )}
      layerClassName="rounded-sm"
    >
      {url === null ? null : (
        <Image
          source={{ uri: url }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
      {raw ? (
        <View
          pointerEvents="none"
          className="absolute bottom-0.5 right-0.5 rounded-xs bg-scrim px-1"
        >
          <Text variant="caption">RAW</Text>
        </View>
      ) : null}
    </Interactive>
  );
}

export function StackStrip({
  stackId,
  currentId,
  compact,
  busy,
  onOpen,
  onMakeCover,
}: {
  readonly stackId: string;
  readonly currentId: string;
  readonly compact: boolean;
  readonly busy: boolean;
  readonly onOpen: (itemId: string) => void;
  readonly onMakeCover: (stackId: string, itemId: string) => void;
}): ReactNode {
  const stack = usePhotoStack(stackId).data;
  if (stack === undefined) return null;
  const cover = stack.coverItemId === currentId;
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2 px-4 pb-3">
      {compact ? null : (
        <Text variant="caption" tone="variant">
          {stackCaption(stack)}
        </Text>
      )}
      {stack.itemIds.map((itemId) => (
        <Thumb
          key={itemId}
          itemId={itemId}
          current={itemId === currentId}
          compact={compact}
          onOpen={onOpen}
        />
      ))}
      <Button
        label={cover ? 'Cover' : 'Make cover'}
        variant="outlined"
        disabled={cover || busy}
        onPress={() => {
          onMakeCover(stack.id, currentId);
        }}
      />
    </View>
  );
}
