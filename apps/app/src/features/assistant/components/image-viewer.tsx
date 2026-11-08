import type { ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FlatList, View, type NativeScrollEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { Rect } from '../../../components/anchor';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { ToastModal } from '../../../components/toast-modal';
import { useEscape } from '../../../components/use-escape';
import { useMotion } from '../../../design/motion';
import { isNative, useIdiom } from '../../../design/platform';
import { ThemeScope } from '../../../design/theme-scope';
import { clock, dayLabel } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { imageActionsOf, quoteChatImage, useChatImages, type ChatImage } from '../data/chat-images';
import { useAttachmentLinks } from '../data/remote';
import { ImageResultContext } from '../images/components/image-result-context';
import { personParticipant } from '../model/participant';
import { SpeakerAvatar } from './speaker-avatar';
import { useArrowKeys } from './use-arrow-keys';
import {
  Backdrop,
  fittedFrame,
  openingFrom,
  PageDots,
  PageSteps,
  ShownChrome,
  useDragClose,
  useStageStyle,
  useViewerMotion,
  ZoomPage,
  type PageSize,
  type ViewerMotion,
} from './zoom-page';

const NO_AREA: Rect = { x: 0, y: 0, width: 0, height: 0 };

type Links = ReturnType<typeof useAttachmentLinks>['data'];
type ListRef = RefObject<FlatList<ChatImage> | null>;

interface Paging {
  readonly index: number;
  readonly area: Rect;
  readonly size: PageSize;
  readonly zoomed: boolean;
  readonly setArea: (area: Rect) => void;
  readonly setZoomed: (zoomed: boolean) => void;
  readonly settle: (event: NativeScrollEvent) => void;
  readonly go: (next: number) => void;
}

function usePaging(count: number, first: number, listRef: ListRef): Paging {
  const [index, setIndex] = useState(first);
  const [area, setArea] = useState<Rect>(NO_AREA);
  const [zoomed, setZoomed] = useState(false);
  const { reduced } = useMotion();
  const go = (next: number): void => {
    if (next < 0 || next >= count) return;
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: !reduced });
  };
  const settle = (event: NativeScrollEvent): void => {
    setIndex(Math.round(event.contentOffset.x / Math.max(1, area.width)));
  };
  const size = { width: area.width, height: area.height };
  return { index, area, size, zoomed, setArea, setZoomed, settle, go };
}

function usePagePosition(listRef: ListRef, width: number, index: number): void {
  const position = useEffectEvent(() => {
    listRef.current?.scrollToOffset({ offset: width * index, animated: false });
  });
  useEffect(() => {
    position();
  }, [width, listRef]);
}

function useOpenOnLayout(width: number, begin: () => void): void {
  const run = useEffectEvent(begin);
  const measured = width > 0;
  useEffect(() => {
    if (measured) run();
  }, [measured]);
}

interface PagesProps {
  readonly images: readonly ChatImage[];
  readonly links: Links;
  readonly first: number;
  readonly paging: Paging;
  readonly listRef: ListRef;
}

function Pages({ images, links, first, paging, listRef }: PagesProps): ReactNode {
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
      keyExtractor={(image) => image.attachment.id}
      onMomentumScrollEnd={(event) => {
        paging.settle(event.nativeEvent);
      }}
      renderItem={({ item }) => (
        <ZoomPage
          image={item.attachment}
          url={links?.[item.attachment.id]?.url}
          size={paging.size}
          onZoomed={paging.setZoomed}
        />
      )}
      className="flex-1"
    />
  );
}

function Stage({
  motion,
  origin,
  ...pages
}: PagesProps & { readonly motion: ViewerMotion; readonly origin: Rect | null }): ReactNode {
  const { paging, images, first } = pages;
  const current = images[paging.index];
  const opening = openingFrom(
    current === undefined ? paging.area : fittedFrame(current.attachment, paging.area),
    paging.index === first ? origin : null,
  );
  const stage = useStageStyle(motion, opening, paging.size.height);
  const gesture = useDragClose(motion, paging.size, !paging.zoomed);
  useOpenOnLayout(paging.size.width, motion.begin);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={stage}
        className="flex-1"
        onLayout={(event) => {
          const { x, y, width, height } = event.nativeEvent.layout;
          paging.setArea({ x, y, width: Math.round(width), height: Math.round(height) });
        }}
      >
        {paging.size.width === 0 ? null : <Pages {...pages} />}
      </Animated.View>
    </GestureDetector>
  );
}

function ViewerTop({
  image,
  url,
  index,
  count,
  onClose,
  onLeave,
}: {
  readonly image: ChatImage | undefined;
  readonly url: string | undefined;
  readonly index: number;
  readonly count: number;
  readonly onClose: () => void;
  readonly onLeave: () => void;
}): ReactNode {
  const items = image === undefined ? [] : imageActionsOf(image, url, onLeave);
  const { ref, open, menu } = useAnchoredMenu(items, 'Image actions');
  return (
    <View className="h-14 flex-row items-center justify-between pl-1 pr-2 pt-safe">
      <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />
      {count > 1 ? (
        <Text variant="label" tone="variant" className="tabular">
          {`${String(index + 1)} / ${String(count)}`}
        </Text>
      ) : null}
      <View ref={ref} collapsable={false}>
        <IconButton icon="share" label="More" disabled={items.length === 0} onPress={open} />
        {menu}
      </View>
    </View>
  );
}

function ViewerCaption({
  image,
  onLeave,
}: {
  readonly image: ChatImage;
  readonly onLeave: () => void;
}): ReactNode {
  const [now] = useState(Date.now);
  const { messageId } = image;
  const when = `${dayLabel(image.at, now)} ${clock(image.at)}`;
  return (
    <View className="flex-row items-center gap-2 px-4 pb-safe-offset-5 pt-1.5">
      <SpeakerAvatar participant={personParticipant(image.sender)} live={false} />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {image.sender}
        </Text>
        <Text variant="caption" tone="variant" className="tabular" numberOfLines={1}>
          {joinParts([when, image.caption])}
        </Text>
        <ImageResultContext image={image.attachment} chatId={image.chatId} />
      </View>
      {messageId === null ? null : (
        <IconButton
          icon="reply"
          label="Quote"
          variant="tonal"
          onPress={() => {
            onLeave();
            quoteChatImage(image, messageId);
          }}
        />
      )}
    </View>
  );
}

interface ViewerProps {
  readonly startId: string;
  readonly origin: Rect | null;
  readonly chatId: string | undefined;
  readonly onClose: () => void;
}

function useFocusRoot(): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!isNative()) ref.current?.focus();
  }, []);
  return ref;
}

interface ViewerState {
  readonly images: readonly ChatImage[];
  readonly links: Links;
  readonly first: number;
  readonly listRef: ListRef;
  readonly paging: Paging;
  readonly motion: ViewerMotion;
  readonly current: ChatImage | undefined;
  readonly url: string | undefined;
}

function useViewerState({ startId, chatId, onClose }: ViewerProps): ViewerState {
  const images = useChatImages(startId, chatId ?? null);
  const links = useAttachmentLinks(images.map((image) => image.attachment.id)).data;
  const first = Math.max(
    0,
    images.findIndex((image) => image.attachment.id === startId),
  );
  const listRef = useRef<FlatList<ChatImage>>(null);
  const paging = usePaging(images.length, first, listRef);
  const motion = useViewerMotion(onClose);
  const { index, go } = paging;
  const current = images[index];
  const url = current === undefined ? undefined : links?.[current.attachment.id]?.url;
  useEscape(true, motion.close);
  useArrowKeys(
    !paging.zoomed,
    () => {
      go(index - 1);
    },
    () => {
      go(index + 1);
    },
  );
  return { images, links, first, listRef, paging, motion, current, url };
}

function ViewerFrame({
  onClose,
  children,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const root = useFocusRoot();
  return (
    <ToastModal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemeScope theme="dark">
        <View
          ref={root}
          tabIndex={-1}
          accessibilityViewIsModal
          accessibilityLabel="Image viewer"
          className="flex-1 web:outline-none"
        >
          {children}
        </View>
      </ThemeScope>
    </ToastModal>
  );
}

function Viewer(props: ViewerProps): ReactNode {
  const { images, links, first, listRef, paging, motion, current, url } = useViewerState(props);
  const pointer = useIdiom() === 'pointer';
  const { index, go, size } = paging;
  const leave = props.onClose;
  return (
    <ViewerFrame onClose={motion.close}>
      <Backdrop motion={motion} height={size.height} />
      <ShownChrome motion={motion} height={size.height}>
        <ViewerTop
          image={current}
          url={url}
          index={index}
          count={images.length}
          onClose={motion.close}
          onLeave={leave}
        />
      </ShownChrome>
      <Stage
        images={images}
        links={links}
        first={first}
        paging={paging}
        listRef={listRef}
        motion={motion}
        origin={props.origin}
      />
      {pointer ? <PageSteps index={index} count={images.length} go={go} /> : null}
      <ShownChrome motion={motion} height={size.height}>
        <PageDots count={images.length} index={index} width={size.width} />
        {current === undefined ? null : <ViewerCaption image={current} onLeave={leave} />}
      </ShownChrome>
    </ViewerFrame>
  );
}

export function ImageViewer({
  startId,
  origin,
  chatId,
  onClose,
}: {
  readonly startId: string | null;
  readonly origin?: Rect | null | undefined;
  readonly chatId?: string | undefined;
  readonly onClose: () => void;
}): ReactNode {
  return startId === null ? null : (
    <Viewer
      key={startId}
      startId={startId}
      origin={origin ?? null}
      chatId={chatId}
      onClose={onClose}
    />
  );
}
