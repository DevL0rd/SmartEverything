import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { noteKindOf, type AssistantAttachment } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { bytes } from '../../../format/number';
import { isImageAttachment } from '../data/chat-images';
import { downloadFile, isPreviewable, previewFile } from '../../../platform/file-actions';
import { useAttachmentLinks } from '../data/remote';
import type { ParticipantInk } from '../model/participant';
import { VoiceClip } from '../voice-message/voice-clip';
import { CHAT_SURFACE, CHAT_SURFACE_IN_BUBBLE } from './chat-surface';
import { FILE_KIND_LOOK, fileKindOf, typeTagOf } from './file-kind';
import { gridOf, type GridRow } from './image-grid';
import { ImageViewer } from './image-viewer';

export type AttachmentTint = 'surface' | 'bubble';

type LinkState = 'loading' | 'ready' | 'failed';

type Links = ReturnType<typeof useAttachmentLinks>;

function stateOf(links: Links, attachment: AssistantAttachment): LinkState {
  if (links.isError || (links.data !== undefined && links.data[attachment.id] === undefined)) {
    return 'failed';
  }
  return links.data === undefined ? 'loading' : 'ready';
}

function refetch(links: Links): void {
  background(links.refetch(), 'links.refetch_failed');
}

function BrokenImage({
  attachment,
  onRetry,
}: {
  readonly attachment: AssistantAttachment;
  readonly onRetry: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`Retry loading ${attachment.name}`}
      onPress={onRetry}
      className="size-full items-center justify-center gap-1 bg-surface-1"
    >
      <Icon name="image" size={16} tone="faint" />
      <Text variant="footnote" tone="primary">
        Retry
      </Text>
    </Interactive>
  );
}

function FadeImage({
  attachment,
  url,
  onError,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string;
  readonly onError: () => void;
}): ReactNode {
  const motion = useMotion();
  const opacity = useSharedValue(0);
  const reveal = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={reveal} className="absolute inset-0">
      <Image
        source={{ uri: url }}
        resizeMode="cover"
        accessibilityLabel={attachment.name}
        onError={onError}
        onLoad={() => {
          opacity.set(
            motion.reduced
              ? 1
              : withTiming(1, { duration: DURATION.mediumOut, easing: EASING.fade }),
          );
        }}
        className="size-full"
      />
    </Animated.View>
  );
}

interface TileProps {
  readonly attachment: AssistantAttachment;
  readonly links: Links;
  readonly onOpen: (id: string) => void;
}

function ImageTile({ attachment, links, onOpen }: TileProps): ReactNode {
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  const state = stateOf(links, attachment);
  const url = links.data?.[attachment.id]?.url;
  if (state === 'failed' || broken) {
    return (
      <BrokenImage
        attachment={attachment}
        onRetry={() => {
          if (state === 'failed') {
            refetch(links);
            return;
          }
          setBroken(false);
          setAttempt(attempt + 1);
        }}
      />
    );
  }
  return (
    <Interactive
      label={`View ${attachment.name}`}
      onPress={() => {
        onOpen(attachment.id);
      }}
      className="size-full"
      focusInset
    >
      <View aria-hidden className="absolute inset-0 bg-surface-3" />
      {url === undefined ? null : (
        <FadeImage
          key={`${url}:${String(attempt)}`}
          attachment={attachment}
          url={url}
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </Interactive>
  );
}

function ImageRow({
  row,
  images,
  links,
  onOpen,
}: {
  readonly row: GridRow;
  readonly images: readonly AssistantAttachment[];
  readonly links: Links;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  return (
    <View style={row.shape} className="w-full flex-row gap-0.5">
      {row.cells.map((cell) => {
        const attachment = images[cell.index];
        return attachment === undefined ? null : (
          <View key={attachment.id} style={cell.shape} className="h-full">
            <ImageTile attachment={attachment} links={links} onOpen={onOpen} />
          </View>
        );
      })}
    </View>
  );
}

function ImageGroup({
  images,
  links,
  shape,
  onOpen,
}: {
  readonly images: readonly AssistantAttachment[];
  readonly links: Links;
  readonly shape: string;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  const grid = gridOf(images);
  return (
    <View style={grid.shape} className={cn('max-w-full gap-0.5 overflow-hidden', shape)}>
      {grid.rows.map((row) => (
        <ImageRow
          key={row.cells.map((cell) => images[cell.index]?.id).join(':')}
          row={row}
          images={images}
          links={links}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function openAttachment(attachment: AssistantAttachment, url: string): void {
  if (isPreviewable(attachment.mime)) {
    previewFile(url, attachment.name);
    return;
  }
  downloadFile(url, attachment.name);
}

function FileTrail({
  attachment,
  state,
}: {
  readonly attachment: AssistantAttachment;
  readonly state: LinkState;
}): ReactNode {
  const tag = typeTagOf(attachment.name);
  if (state === 'failed') {
    return (
      <Text variant="caption" tone="primary">
        Retry
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-1.5">
      {tag === null ? null : (
        <Text variant="caption" className={FILE_KIND_LOOK[fileKindOf(attachment)].text}>
          {tag}
        </Text>
      )}
      <Text variant="caption" tone="faint" className="tabular">
        {bytes(attachment.bytes)}
      </Text>
    </View>
  );
}

function FileDownload({
  attachment,
  url,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string;
}): ReactNode {
  return (
    <Interactive
      label={`Download ${attachment.name}`}
      onPress={() => {
        downloadFile(url, attachment.name);
      }}
      className="mr-1.5 size-8 items-center justify-center"
      layerClassName="rounded-sm"
    >
      <Icon name="download" size={20} tone="variant" />
    </Interactive>
  );
}

function FileLine({
  attachment,
  links,
  tint,
}: {
  readonly attachment: AssistantAttachment;
  readonly links: Links;
  readonly tint: AttachmentTint;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const url = links.data?.[attachment.id]?.url;
  const state = stateOf(links, attachment);
  const look = FILE_KIND_LOOK[fileKindOf(attachment)];
  return (
    <View
      className={cn(
        'h-11 w-full flex-row items-center',
        tint === 'bubble' ? CHAT_SURFACE_IN_BUBBLE : cn(CHAT_SURFACE, 'max-w-sm'),
      )}
    >
      <Interactive
        label={`Open ${attachment.name}`}
        disabled={state === 'loading'}
        onPress={() => {
          if (url === undefined) {
            refetch(links);
            return;
          }
          openAttachment(attachment, url);
        }}
        className="h-full min-w-0 flex-1 flex-row items-center gap-2.5 pl-1.5 pr-3"
        layerClassName="rounded-md"
      >
        <View className={cn('size-8 items-center justify-center rounded-sm', look.tile)}>
          <Icon name={look.icon} size={16} colour={look.ink} />
        </View>
        <Text variant="label" ellipsize="middle" className="flex-1">
          {attachment.name}
        </Text>
        <FileTrail attachment={attachment} state={state} />
      </Interactive>
      {pointer && url !== undefined ? <FileDownload attachment={attachment} url={url} /> : null}
    </View>
  );
}

function FileAttachments({
  files,
  links,
  tint,
  ink,
}: {
  readonly files: readonly AssistantAttachment[];
  readonly links: Links;
  readonly tint: AttachmentTint;
  readonly ink: ParticipantInk | null;
}): ReactNode {
  return (
    <View className="gap-1">
      {files.map((attachment) => {
        if (noteKindOf(attachment.mime) !== 'audio') {
          return <FileLine key={attachment.id} attachment={attachment} links={links} tint={tint} />;
        }
        const url = links.data?.[attachment.id]?.url;
        return (
          <VoiceClip
            key={attachment.id}
            attachment={attachment}
            url={url}
            linkState={
              links.isFetching && url === undefined ? 'loading' : stateOf(links, attachment)
            }
            retry={() => {
              refetch(links);
            }}
            mine={tint === 'bubble'}
            ink={ink}
          />
        );
      })}
    </View>
  );
}

interface AttachmentsProps {
  readonly attachments: readonly AssistantAttachment[];
  readonly chatId?: string | undefined;
  readonly tint?: AttachmentTint;
  readonly ink?: ParticipantInk | null;
  readonly imageShape?: string;
}

export function Attachments({
  attachments,
  chatId,
  tint = 'surface',
  ink = null,
  imageShape = 'rounded-md',
}: AttachmentsProps): ReactNode {
  const links = useAttachmentLinks(attachments.map((attachment) => attachment.id));
  const [viewed, setViewed] = useState<string | null>(null);
  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((attachment) => !isImageAttachment(attachment));
  return (
    <View className="gap-2">
      {images.length === 0 ? null : (
        <ImageGroup images={images} links={links} shape={imageShape} onOpen={setViewed} />
      )}
      {files.length === 0 ? null : (
        <FileAttachments files={files} links={links} tint={tint} ink={ink} />
      )}
      <ImageViewer
        startId={viewed}
        chatId={chatId}
        onClose={() => {
          setViewed(null);
        }}
      />
    </View>
  );
}
