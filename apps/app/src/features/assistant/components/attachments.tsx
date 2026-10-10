import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import type { AssistantAttachment } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useAttachmentLinks } from '../data/remote';
import { ImageViewer, type ViewedImage } from './image-viewer';

const isImage = (attachment: AssistantAttachment): boolean => attachment.mime.startsWith('image/');

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

function ImageTile({
  attachment,
  url,
  single,
  onOpen,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string | undefined;
  readonly single: boolean;
  readonly onOpen: (image: ViewedImage) => void;
}): ReactNode {
  const wide =
    single &&
    attachment.width !== null &&
    attachment.height !== null &&
    attachment.width > attachment.height * 1.2;
  return (
    <Interactive
      label={`View ${attachment.name}`}
      disabled={url === undefined}
      onPress={() => {
        if (url !== undefined) {
          onOpen({ url, name: attachment.name });
        }
      }}
      className="overflow-hidden rounded-lg bg-surface-3"
      layerClassName="rounded-lg"
    >
      <View className={cn('w-full', wide ? 'aspect-video' : 'aspect-square')}>
        {url === undefined ? (
          <Skeleton shape="block" className="size-full" />
        ) : (
          <Image
            source={{ uri: url }}
            resizeMode="cover"
            accessibilityLabel={attachment.name}
            className="size-full"
          />
        )}
      </View>
    </Interactive>
  );
}

function FileRow({
  attachment,
  url,
}: {
  readonly attachment: AssistantAttachment;
  readonly url: string | undefined;
}): ReactNode {
  return (
    <Interactive
      label={`Open ${attachment.name}`}
      disabled={url === undefined}
      onPress={() => {
        if (url !== undefined) {
          void Linking.openURL(url);
        }
      }}
      className="min-h-touch-min flex-row items-center gap-3 rounded-lg bg-surface-2 p-2 pr-3"
      layerClassName="rounded-lg"
    >
      <View className="size-10 items-center justify-center rounded-md bg-primary/15">
        <Icon name={fileIcon(attachment.mime)} size={20} tone="primary" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="label" tone="default" numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {joinParts([extensionOf(attachment.name), bytes(attachment.bytes)])}
        </Text>
      </View>
      <Icon name="download" size={20} tone="variant" />
    </Interactive>
  );
}

export function Attachments({
  attachments,
}: {
  readonly attachments: readonly AssistantAttachment[];
}): ReactNode {
  const links = useAttachmentLinks(attachments.map((attachment) => attachment.id)).data;
  const [viewed, setViewed] = useState<ViewedImage | null>(null);
  const images = attachments.filter(isImage);
  const files = attachments.filter((attachment) => !isImage(attachment));
  return (
    <View className="gap-2">
      {images.length === 0 ? null : (
        <View className="-m-1 flex-row flex-wrap">
          {images.map((attachment) => (
            <View
              key={attachment.id}
              className={cn('p-1', images.length === 1 ? 'w-72 max-w-full' : 'w-1/2')}
            >
              <ImageTile
                attachment={attachment}
                url={links?.[attachment.id]?.url}
                single={images.length === 1}
                onOpen={setViewed}
              />
            </View>
          ))}
        </View>
      )}
      {files.map((attachment) => (
        <FileRow key={attachment.id} attachment={attachment} url={links?.[attachment.id]?.url} />
      ))}
      <ImageViewer
        image={viewed}
        onClose={() => {
          setViewed(null);
        }}
      />
    </View>
  );
}
