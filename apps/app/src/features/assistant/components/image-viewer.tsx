import type { ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FlatList, Modal, View, type NativeScrollEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeScope } from '../../../design/theme-scope';
import type { AssistantAttachment } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { isNative, useIdiom } from '../../../design/platform';
import { useMotion } from '../../../design/motion';
import { cn } from '../../../design/cn';
import { useChatImages } from '../data/chat-images';
import { canShareFiles, downloadFile, shareFile } from '../../../platform/file-actions';
import type { SignedLink } from '../../../api/media';
import { useAttachmentLinks } from '../data/remote';
import { useArrowKeys } from './use-arrow-keys';
import { ZoomPage, type PageSize } from './zoom-page';
import { ImageResultContext } from '../images/components/image-result-context';

const FILL = { flex: 1 } as const;

function ViewerBar({
  image,
  url,
  position,
  onClose,
}: {
  readonly image: AssistantAttachment;
  readonly url: string | undefined;
  readonly position: string | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="z-10 flex-row items-center gap-2 px-2 pt-safe-offset-2">
      <IconButton icon="close" label="Close" variant="overlay" onPress={onClose} shortcut="Esc" />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {image.name}
        </Text>
        {position === null ? null : (
          <Text variant="caption" tone="variant">
            {position}
          </Text>
        )}
      </View>
      {url === undefined || !canShareFiles() ? null : (
        <IconButton
          icon="share"
          label={`Share ${image.name}`}
          variant="overlay"
          onPress={() => {
            shareFile(url, image.name);
          }}
        />
      )}
      <IconButton
        icon="download"
        label={`Download ${image.name}`}
        variant="overlay"
        disabled={url === undefined}
        onPress={() => {
          if (url !== undefined) {
            downloadFile(url, image.name);
          }
        }}
      />
    </View>
  );
}

function Step({
  side,
  label,
  onPress,
}: {
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      className={cn('absolute inset-y-0 justify-center', side === 'left' ? 'left-2' : 'right-2')}
    >
      <IconButton
        icon={side === 'left' ? 'chevronLeft' : 'chevronRight'}
        label={label}
        variant="overlay"
        onPress={onPress}
      />
    </View>
  );
}

function useFocusRoot(): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!isNative()) {
      ref.current?.focus();
    }
  }, []);
  return ref;
}

interface Paging {
  readonly index: number;
  readonly size: PageSize;
  readonly zoomed: boolean;
  readonly setSize: (size: PageSize) => void;
  readonly setZoomed: (zoomed: boolean) => void;
  readonly settle: (event: NativeScrollEvent) => void;
  readonly go: (next: number) => void;
}

function usePaging(
  count: number,
  first: number,
  listRef: RefObject<FlatList<AssistantAttachment> | null>,
): Paging {
  const [index, setIndex] = useState(first);
  const [size, setSize] = useState<PageSize>({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);
  const { reduced } = useMotion();
  const go = (next: number): void => {
    if (next < 0 || next >= count) {
      return;
    }
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: !reduced });
  };
  const settle = (event: NativeScrollEvent): void => {
    setIndex(Math.round(event.contentOffset.x / size.width));
  };
  return { index, size, zoomed, setSize, setZoomed, settle, go };
}

function usePagePosition(
  listRef: RefObject<FlatList<AssistantAttachment> | null>,
  width: number,
  index: number,
): void {
  const position = useEffectEvent(() => {
    listRef.current?.scrollToOffset({ offset: width * index, animated: false });
  });
  useEffect(() => {
    position();
  }, [width, listRef]);
}

function Pages({
  images,
  links,
  first,
  paging,
  listRef,
}: {
  readonly images: readonly AssistantAttachment[];
  readonly links: Readonly<Record<string, SignedLink>> | undefined;
  readonly first: number;
  readonly paging: Paging;
  readonly listRef: RefObject<FlatList<AssistantAttachment> | null>;
}): ReactNode {
  const { width } = paging.size;
  usePagePosition(listRef, width, paging.index);
  return (
    <FlatList
      ref={listRef}
      data={images}
      horizontal
      pagingEnabled
      scrollEnabled={!paging.zoomed}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={first}
      getItemLayout={(_, position) => ({
        length: width,
        offset: width * position,
        index: position,
      })}
      keyExtractor={(image) => image.id}
      onMomentumScrollEnd={(event) => {
        paging.settle(event.nativeEvent);
      }}
      renderItem={({ item }) => (
        <ZoomPage
          image={item}
          url={links?.[item.id]?.url}
          size={paging.size}
          onZoomed={paging.setZoomed}
        />
      )}
      className="flex-1"
    />
  );
}

function Steps({ paging, count }: { readonly paging: Paging; readonly count: number }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { index, go } = paging;
  if (!pointer) {
    return null;
  }
  return (
    <>
      {index > 0 ? (
        <Step
          side="left"
          label="Previous image"
          onPress={() => {
            go(index - 1);
          }}
        />
      ) : null}
      {index < count - 1 ? (
        <Step
          side="right"
          label="Next image"
          onPress={() => {
            go(index + 1);
          }}
        />
      ) : null}
    </>
  );
}

function CurrentBar({
  images,
  links,
  index,
  onClose,
}: {
  readonly images: readonly AssistantAttachment[];
  readonly links: Readonly<Record<string, SignedLink>> | undefined;
  readonly index: number;
  readonly onClose: () => void;
}): ReactNode {
  const current = images[index];
  if (current === undefined) {
    return null;
  }
  return (
    <ViewerBar
      image={current}
      url={links?.[current.id]?.url}
      position={images.length > 1 ? `${String(index + 1)} of ${String(images.length)}` : null}
      onClose={onClose}
    />
  );
}

function PageArea({
  images,
  links,
  first,
  paging,
  listRef,
}: {
  readonly images: readonly AssistantAttachment[];
  readonly links: Readonly<Record<string, SignedLink>> | undefined;
  readonly first: number;
  readonly paging: Paging;
  readonly listRef: RefObject<FlatList<AssistantAttachment> | null>;
}): ReactNode {
  return (
    <View
      className="flex-1"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        paging.setSize({ width: Math.round(width), height: Math.round(height) });
      }}
    >
      {paging.size.width === 0 ? null : (
        <Pages images={images} links={links} first={first} paging={paging} listRef={listRef} />
      )}
    </View>
  );
}

function ResultFooter({
  image,
  chatId,
}: {
  readonly image: AssistantAttachment | undefined;
  readonly chatId: string | undefined;
}): ReactNode {
  return (
    <View className="px-3 pb-safe-offset-3">
      {image === undefined ? null : (
        <View className="gap-2">
          <ImageResultContext image={image} chatId={chatId} />
        </View>
      )}
    </View>
  );
}

function Viewer({
  startId,
  onClose,
  chatId,
}: {
  readonly startId: string;
  readonly chatId?: string | undefined;
  readonly onClose: () => void;
}): ReactNode {
  const images = useChatImages(startId, chatId ?? null);
  const links = useAttachmentLinks(images.map((image) => image.id)).data;
  const first = Math.max(
    0,
    images.findIndex((image) => image.id === startId),
  );
  const listRef = useRef<FlatList<AssistantAttachment>>(null);
  const paging = usePaging(images.length, first, listRef);
  const root = useFocusRoot();
  const { index, go } = paging;
  useEscape(true, onClose);
  useArrowKeys(
    !paging.zoomed,
    () => {
      go(index - 1);
    },
    () => {
      go(index + 1);
    },
  );
  return (
    <GestureHandlerRootView style={FILL}>
      <ThemeScope theme="dark">
        <View
          ref={root}
          tabIndex={-1}
          accessibilityViewIsModal
          accessibilityLabel="Image viewer"
          className="flex-1 bg-bg outline-none"
        >
          <CurrentBar images={images} links={links} index={index} onClose={onClose} />
          <PageArea images={images} links={links} first={first} paging={paging} listRef={listRef} />
          <Steps paging={paging} count={images.length} />
          <ResultFooter image={images[index]} chatId={chatId} />
        </View>
      </ThemeScope>
    </GestureHandlerRootView>
  );
}

export function ImageViewer({
  startId,
  onClose,
  chatId,
}: {
  readonly startId: string | null;
  readonly chatId?: string | undefined;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Modal
      visible={startId !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {startId === null ? null : <Viewer startId={startId} onClose={onClose} chatId={chatId} />}
    </Modal>
  );
}
