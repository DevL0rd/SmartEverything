import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { z } from 'zod';
import {
  AI_HARNESS_ENDPOINTS as E,
  type AiChatRow,
  type AssistantAttachment,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { WorkspaceFileDiffs } from '../components/tool-file-diffs';
import { leafName } from './project-files';
import { LoadFailed, RowsSkeleton } from './section-state';
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

function FileColumn({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="min-w-0 grow shrink basis-80 gap-section-gap">{children}</View>;
}

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
      wrapTitle
      subtitle={joinParts([bytes(attachment.bytes), when(at)])}
      leading={<IconWell icon={fileIcon(attachment)} colour="viz-1" size="m" />}
      onPress={() => {
        if (isImageAttachment(attachment)) onImage(attachment.id);
        else background(openAttachment(attachment), 'attachment.open_failed');
      }}
    />
  );
}

type Workspace = z.output<(typeof E)['readAiChatWorkspace']['response']>;

const isSettled = (row: AssistantMessageRow): boolean =>
  row.state === 'answered' || row.state === 'failed';

function useWorkspace(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
): ReturnType<typeof useScreenQuery<Workspace>> {
  const settled = rows.filter(isSettled).length;
  const engine = chat.engine;
  return useScreenQuery({
    queryKey: ['window', 'ai-workspace', chat.id, settled],
    enabled: engine.kind === 'dsh' && engine.session_id !== null,
    queryFn: () => api().call(E.readAiChatWorkspace, { params: { chatId: chat.id } }),
  });
}

function turnTotals(turn: Workspace['turns'][number]): string {
  return joinParts([
    turn.total === 1 ? '1 file' : `${String(turn.total)} files`,
    `+${String(turn.added)} −${String(turn.deleted)}`,
  ]);
}

function ChangedTurn({ turn }: { readonly turn: Workspace['turns'][number] }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        leading={<IconWell icon="pencil" colour="viz-3" size="m" />}
        title={`Turn ${String(turn.turn)}`}
        subtitle={turnTotals(turn)}
        chevron
        selected={open}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? <WorkspaceFileDiffs files={turn.files} /> : null}
    </>
  );
}

function DeliverableRow({
  deliverable,
  files,
}: {
  readonly deliverable: Workspace['deliverables'][number];
  readonly files: readonly AttachedFile[];
}): ReactNode {
  const attachment = files.find(
    (file) => file.attachment.id === deliverable.attachment_id,
  )?.attachment;
  return (
    <ListRow
      leading={<IconWell icon="download" colour="viz-2" size="m" />}
      title={leafName(deliverable.path)}
      subtitle={deliverable.description ?? deliverable.path}
      wrapTitle
      wrapSubtitle
      {...(attachment === undefined
        ? { value: 'Not saved' }
        : {
            onPress: (): void => {
              background(openAttachment(attachment), 'attachment.open_failed');
            },
          })}
    />
  );
}

function WorkspaceGroups({
  workspace,
  files,
}: {
  readonly workspace: Workspace;
  readonly files: readonly AttachedFile[];
}): ReactNode {
  const turns = workspace.turns
    .filter((turn) => turn.files.length > 0)
    .sort((left, right) => right.turn - left.turn);
  const showChanges = turns.length > 0 || workspace.git === 'missing';
  if (workspace.deliverables.length === 0 && !showChanges) return null;
  return (
    <FileColumn>
      {workspace.deliverables.length === 0 ? null : (
        <List title="Deliverables">
          {workspace.deliverables.map((deliverable) => (
            <DeliverableRow
              key={`${deliverable.call_id}:${deliverable.path}`}
              deliverable={deliverable}
              files={files}
            />
          ))}
        </List>
      )}
      {showChanges ? (
        <List title="Changed files">
          {[
            ...turns.map((turn) => <ChangedTurn key={turn.turn} turn={turn} />),
            workspace.git === 'missing' ? (
              <ListRow
                key="git"
                icon="info"
                title="Changes made by commands aren’t tracked"
                subtitle="Install git on this machine to track them."
                wrapSubtitle
              />
            ) : null,
          ]}
        </List>
      ) : null}
    </FileColumn>
  );
}

function WorkspaceSection({
  chat,
  rows,
  files,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly files: readonly AttachedFile[];
}): ReactNode {
  const workspace = useWorkspace(chat, rows);
  if (workspace.data !== undefined)
    return <WorkspaceGroups workspace={workspace.data} files={files} />;
  if (workspace.error !== null) {
    return (
      <FileColumn>
        <LoadFailed
          what="changed files"
          retry={() => {
            background(workspace.refetch(), 'workspace.refetch_failed');
          }}
        />
      </FileColumn>
    );
  }
  return workspace.isFetching ? (
    <FileColumn>
      <RowsSkeleton />
    </FileColumn>
  ) : null;
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
    <View className="flex-row flex-wrap items-start gap-section-gap">
      {files.length === 0 ? null : (
        <FileColumn>
          <List title="Attachments">
            {files.map((file) => (
              <AttachmentRow key={file.attachment.id} file={file} onImage={setViewed} />
            ))}
          </List>
        </FileColumn>
      )}
      {project ? <WorkspaceSection chat={chat} rows={rows} files={files} /> : null}
      {project ? (
        <FileColumn>
          <ProjectFilesGroup chat={chat} />
        </FileColumn>
      ) : null}
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
