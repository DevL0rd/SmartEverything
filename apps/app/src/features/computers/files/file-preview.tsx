import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Image, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FileContent } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { useComputerFile } from '../data/computer-files';
import { NO_CHAT_REASON, pickedFromContent, useChatAttach } from './chat-attach';
import { isImage } from './file-model';
import { background } from '@smarteverything/logging';

function Lines({ text }: { readonly text: string }): ReactNode {
  const lines = useMemo(() => text.split('\n'), [text]);
  return (
    <View className="min-h-0 flex-1 rounded-md border-hairline border-outline-variant bg-surface-2">
      <FlashList
        data={lines}
        keyExtractor={(_line, index) => String(index)}
        ListHeaderComponent={<View className="h-3" />}
        ListFooterComponent={<View className="h-3" />}
        renderItem={({ item }) => (
          <Text selectable className="px-3 font-mono text-footnote">
            {item === '' ? ' ' : item}
          </Text>
        )}
      />
    </View>
  );
}

function Preview({ file }: { readonly file: FileContent }): ReactNode {
  if (file.encoding === 'text') return <Lines text={file.content} />;
  if (isImage(file.mimeType)) {
    return (
      <Image
        accessibilityLabel={file.name}
        source={{ uri: `data:${file.mimeType};base64,${file.content}` }}
        resizeMode="contain"
        className="min-h-0 flex-1 rounded-md bg-surface-2"
      />
    );
  }
  return (
    <EmptyState
      compact
      icon="fileText"
      title="No preview for this kind of file"
      body="Add it to a chat to have the assistant look at it."
    />
  );
}

function Loaded({
  file,
  onDownload,
}: {
  readonly file: FileContent;
  readonly onDownload: () => void;
}): ReactNode {
  const chat = useChatAttach();
  return (
    <View className="min-h-0 flex-1 gap-3">
      <Text variant="footnote" tone="variant">
        {`${bytes(file.size)} · ${file.mimeType} · read-only preview`}
      </Text>
      <Preview file={file} />
      <View className="flex-row flex-wrap gap-2">
        {file.encoding === 'text' ? (
          <Button
            label="Copy"
            icon="copy"
            variant="tonal"
            onPress={() => {
              copyText(file.content, file.name);
            }}
          />
        ) : null}
        <Button label="Download" icon="download" variant="tonal" onPress={onDownload} />
        <Button
          label="Attach to chat"
          icon="paperclip"
          variant="tonal"
          disabled={!chat.available}
          onPress={() => {
            chat.attach(pickedFromContent(file));
          }}
        />
      </View>
      {chat.available ? null : <ReasonLine icon="info" text={NO_CHAT_REASON} />}
    </View>
  );
}

function Body({
  deviceId,
  path,
  onDownload,
}: {
  readonly deviceId: string;
  readonly path: string;
  readonly onDownload: () => void;
}): ReactNode {
  const file = useComputerFile(deviceId, path);
  if (file.isError) {
    return (
      <View className="gap-3">
        <ErrorState
          error={file.error}
          retry={() => {
            background(file.refetch(), 'file.refetch_failed');
          }}
        />
        <View className="flex-row">
          <Button label="Download instead" icon="download" variant="tonal" onPress={onDownload} />
        </View>
      </View>
    );
  }
  if (file.data === undefined) return <Skeleton shape="block" />;
  return <Loaded file={file.data} onDownload={onDownload} />;
}

export function FilePreview({
  deviceId,
  path,
  onClose,
  onDownload,
}: {
  readonly deviceId: string;
  readonly path: string | null;
  readonly onClose: () => void;
  readonly onDownload: () => void;
}): ReactNode {
  return (
    <Sheet
      open={path !== null}
      onClose={onClose}
      title={path?.split('/').pop() ?? 'File'}
      detents={['full']}
      scroll={false}
      wide
    >
      {path === null ? null : <Body deviceId={deviceId} path={path} onDownload={onDownload} />}
    </Sheet>
  );
}
