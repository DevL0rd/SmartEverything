import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { bytes } from '../../../format/number';
import type { TextHead } from './text-head';

const log = new Logger('app.files');

type PictureLoad = 'loading' | 'shown' | 'failed';

interface PictureState {
  readonly key: string;
  readonly load: PictureLoad;
}

function PictureFailed({
  label,
  retry,
  onOpen,
}: {
  readonly label: string;
  readonly retry: () => void;
  readonly onOpen: (() => void) | null;
}): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center p-6">
      <EmptyState
        icon="alert"
        title="Couldn’t load this picture"
        body={`${label} didn’t load. Check the connection and try again.`}
        action={
          <View className="flex-row flex-wrap justify-center gap-2">
            <Button label="Try again" icon="refresh" variant="tonal" onPress={retry} />
            {onOpen === null ? null : (
              <Button label="Open" icon="externalLink" variant="text" onPress={onOpen} />
            )}
          </View>
        }
      />
    </View>
  );
}

interface PictureLoadState {
  readonly load: PictureLoad;
  readonly imageKey: string;
  readonly settle: (next: PictureLoad) => void;
  readonly retry: () => void;
}

function usePictureLoad(uri: string | null): PictureLoadState {
  const [attempt, setAttempt] = useState(0);
  const imageKey = `${uri ?? ''}#${String(attempt)}`;
  const [state, setState] = useState<PictureState>({ key: imageKey, load: 'loading' });
  return {
    load: state.key === imageKey ? state.load : 'loading',
    imageKey,
    settle: (next): void => {
      setState({ key: imageKey, load: next });
    },
    retry: (): void => {
      setAttempt((now) => now + 1);
    },
  };
}

function PictureLoading(): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-0 p-4">
      <Skeleton shape="block" className="size-full" />
    </View>
  );
}

export function PictureAt({
  uri,
  placeholder,
  recyclingKey,
  label,
  onZoomed,
  onOpen = null,
}: {
  readonly uri: string | null;
  readonly placeholder: string | null;
  readonly recyclingKey: string;
  readonly label: string;
  readonly onZoomed?: (zoomed: boolean) => void;
  readonly onOpen?: (() => void) | null;
}): ReactNode {
  const { load, imageKey, settle, retry } = usePictureLoad(uri);
  return (
    <View className="size-full">
      <Zoomable
        wheel="wheel"
        className="size-full overflow-hidden"
        {...(onZoomed === undefined ? {} : { onZoomed })}
      >
        <Image
          key={imageKey}
          source={uri === null ? null : { uri }}
          placeholder={placeholder === null ? null : { uri: placeholder }}
          placeholderContentFit="contain"
          contentFit="contain"
          cachePolicy="disk"
          recyclingKey={recyclingKey}
          onLoad={() => {
            settle('shown');
          }}
          onError={(event) => {
            log.warn('quick_look.image_failed', { reason: event.error });
            settle('failed');
          }}
          style={StyleSheet.absoluteFill}
          accessibilityLabel={label}
        />
      </Zoomable>
      {load === 'loading' && placeholder === null ? <PictureLoading /> : null}
      {load === 'failed' ? <PictureFailed label={label} retry={retry} onOpen={onOpen} /> : null}
    </View>
  );
}

function headNote(head: TextHead, total: number): string | null {
  if (!head.partial) return null;
  return `Showing the first ${bytes(head.shownBytes)} of ${bytes(total)}. Open the file to read the rest.`;
}

export function TextLines({
  head,
  total,
  selectable,
}: {
  readonly head: TextHead;
  readonly total: number;
  readonly selectable: boolean;
}): ReactNode {
  const lines = useMemo(() => head.text.split('\n'), [head.text]);
  const note = headNote(head, total);
  return (
    <View className="size-full min-h-0 gap-2 p-4">
      <View className="min-h-0 flex-1 rounded-md border-hairline border-outline-variant bg-surface-1">
        <FlashList
          data={lines}
          keyExtractor={(_line, index) => String(index)}
          ListHeaderComponent={<View className="h-3" />}
          ListFooterComponent={<View className="h-3" />}
          renderItem={({ item }) => (
            <Text selectable={selectable} className="px-4 font-mono text-footnote">
              {item === '' ? ' ' : item}
            </Text>
          )}
        />
      </View>
      {note === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {note}
        </Text>
      )}
    </View>
  );
}
