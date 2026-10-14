import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantAttachment } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { ImagePlaceholder } from '../../../components/image-placeholder';
import { LoadedImage } from '../../../components/loaded-image';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { isImageAttachment } from '../data/chat-images';
import { downloadFile, isPreviewable, previewFile } from '../data/file-actions';
import { useAttachmentLinks } from '../data/remote';
import { ImageViewer } from './image-viewer';

const IMAGE_MAX = 360;
const FRAME = 'overflow-hidden rounded-xl border-hairline border-outline-variant bg-surface-2';

type LinkState = 'loading' | 'ready' | 'failed';

function fileIcon(mime: string): IconName {
  if (mime.startsWith('audio/')) {
    return 'audioLines';
  }
  if (mime.startsWith('video/')) {
    return 'film';
  }
  return mime.startsWith('text/') || mime.includes('pdf') ? 'fileText' : 'box';
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? null : name.slice(dot + 1).toUpperCase();
}

function frameOf(attachment: AssistantAttachment): {
  readonly width: number;
  readonly aspectRatio: number;
} {
  const { width, height } = attachment;
  const aspectRatio = width === null || height === null ? 1 : width / height;
  return { width: Math.round(IMAGE_MAX * Math.min(1, aspectRatio)), aspectRatio };
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
      className="size-full items-center justify-center gap-1 p-3"
    >
      <Icon name="image" size={24} tone="faint" />
      <Text variant="footnote" numberOfLines={1} className="max-w-full">
        {attachment.name}
      </Text>
      <Text variant="caption" tone="primary">
        Tap to retry
      </Text>
    </Interactive>
  );
}

function ImagePicture({
  attachment,
  url,
  single,
  onOpen,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string;
  readonly single: boolean;
  readonly onOpen: () => void;
}): ReactNode {
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <BrokenImage
        attachment={attachment}
        onRetry={() => {
          setBroken(false);
          setAttempt(attempt + 1);
        }}
      />
    );
  }
  return (
    <Interactive
      label={`View ${attachment.name}`}
      onPress={onOpen}
      className="size-full"
      focusInset
    >
      <LoadedImage
        key={`${url}:${String(attempt)}`}
        url={url}
        resizeMode={single ? 'contain' : 'cover'}
        label={attachment.name}
        onError={() => {
          setBroken(true);
        }}
      />
    </Interactive>
  );
}

function ImageTile({
  attachment,
  url,
  state,
  single,
  onOpen,
  onRetry,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string | undefined;
  readonly state: LinkState;
  readonly single: boolean;
  readonly onOpen: () => void;
  readonly onRetry: () => void;
}): ReactNode {
  const frame = single ? frameOf(attachment) : { aspectRatio: 1 };
  return (
    <View style={frame} className={cn(FRAME, single ? 'max-w-full' : 'w-full')}>
      {state === 'loading' ? <ImagePlaceholder /> : null}
      {state === 'failed' || url === undefined ? null : (
        <ImagePicture attachment={attachment} url={url} single={single} onOpen={onOpen} />
      )}
      {state === 'failed' ? <BrokenImage attachment={attachment} onRetry={onRetry} /> : null}
    </View>
  );
}

function FileRow({
  attachment,
  url,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string | undefined;
}): ReactNode {
  const ready = url !== undefined;
  return (
    <View
      className={cn(
        'min-h-touch-min w-full max-w-sm flex-row items-center gap-3 py-2 pl-2 pr-1',
        'rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1',
      )}
    >
      <View className="size-10 items-center justify-center rounded-md bg-primary/15">
        <Icon name={fileIcon(attachment.mime)} size={20} tone="primary" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {joinParts([extensionOf(attachment.name), bytes(attachment.bytes)])}
        </Text>
      </View>
      {ready && isPreviewable(attachment.mime) ? (
        <Button
          label="Open"
          variant="text"
          onPress={() => {
            previewFile(url, attachment.name);
          }}
        />
      ) : null}
      <IconButton
        icon="download"
        label={`Download ${attachment.name}`}
        disabled={!ready}
        onPress={() => {
          if (ready) {
            downloadFile(url, attachment.name);
          }
        }}
      />
    </View>
  );
}

function stateOf(
  links: ReturnType<typeof useAttachmentLinks>,
  attachment: AssistantAttachment,
): LinkState {
  if (links.isError || (links.data !== undefined && links.data[attachment.id] === undefined)) {
    return 'failed';
  }
  return links.data === undefined ? 'loading' : 'ready';
}

interface AttachmentsProps {
  readonly attachments: readonly AssistantAttachment[];
  readonly chatId?: string | undefined;
}

export function Attachments({ attachments, chatId }: AttachmentsProps): ReactNode {
  const links = useAttachmentLinks(attachments.map((attachment) => attachment.id));
  const [viewed, setViewed] = useState<string | null>(null);
  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((attachment) => !isImageAttachment(attachment));
  return (
    <View className="gap-2">
      {images.length === 0 ? null : (
        <View className="-m-0.5 flex-row flex-wrap">
          {images.map((attachment) => (
            <View
              key={attachment.id}
              className={cn('p-0.5', images.length === 1 ? 'max-w-full' : 'w-1/2')}
            >
              <ImageTile
                attachment={attachment}
                url={links.data?.[attachment.id]?.url}
                state={stateOf(links, attachment)}
                single={images.length === 1}
                onOpen={() => {
                  setViewed(attachment.id);
                }}
                onRetry={() => {
                  void links.refetch();
                }}
              />
            </View>
          ))}
        </View>
      )}
      {files.map((attachment) => (
        <FileRow
          key={attachment.id}
          attachment={attachment}
          url={links.data?.[attachment.id]?.url}
        />
      ))}
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
