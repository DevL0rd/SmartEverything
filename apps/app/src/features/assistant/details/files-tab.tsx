import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantAttachment, AssistantMessageRow } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { ImageViewer } from '../components/image-viewer';
import { isImageAttachment } from '../data/chat-images';
import { openAttachment } from './attachment-open';
import { attachedFilesOf, type AttachedFile } from './attachments-model';
import { ProjectFilesGroup } from './project-files-group';
import { useMoment } from './use-moment';
import { background } from '@smarteverything/logging';

function fileIcon(attachment: AssistantAttachment): IconName {
  if (isImageAttachment(attachment)) return 'image';
  return attachment.mime.startsWith('text/') || attachment.mime.includes('pdf')
    ? 'fileText'
    : 'box';
}

function AttachmentRow({
  file,
  onImage,
}: {
  readonly file: AttachedFile;
  readonly onImage: (id: string) => void;
}): ReactNode {
  const when = useMoment();
  const { attachment, at } = file;
  return (
    <ListRow
      title={attachment.name}
      subtitle={joinParts([bytes(attachment.bytes), when(at)])}
      leading={<IconWell icon={fileIcon(attachment)} colour="viz-1" size="m" />}
      onPress={() => {
        if (isImageAttachment(attachment)) onImage(attachment.id);
        else background(openAttachment(attachment), 'attachment.open_failed');
      }}
    />
  );
}

export function FilesTab({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const [viewed, setViewed] = useState<string | null>(null);
  const files = attachedFilesOf(rows);
  const project = chat.engine.kind === 'dsh';
  if (files.length === 0 && !project) {
    return (
      <EmptyState
        compact
        icon="folder"
        title="No files in this chat yet"
        body="Attach files or ask the AI to create one."
      />
    );
  }
  return (
    <View className="gap-section-gap pb-3">
      {files.length === 0 ? null : (
        <List title="Attachments">
          {files.map((file) => (
            <AttachmentRow key={file.attachment.id} file={file} onImage={setViewed} />
          ))}
        </List>
      )}
      {project ? <ProjectFilesGroup chat={chat} /> : null}
      <ImageViewer
        startId={viewed}
        chatId={chat.id}
        onClose={() => {
          setViewed(null);
        }}
      />
    </View>
  );
}
