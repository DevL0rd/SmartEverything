import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import type { AiChatRow, AiProjectFile } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { LoadFailed, RowsSkeleton } from './section-state';
import {
  PROJECT_ROOT,
  leafName,
  parentPath,
  readProjectText,
  sortedProjectEntries,
  useProjectList,
} from './project-files';
import { background } from '@smarteverything/logging';

function FileToolbar({
  text,
  name,
  more,
}: {
  readonly text: string;
  readonly name: string;
  readonly more: {
    readonly available: boolean;
    readonly loading: boolean;
    readonly load: () => void;
  };
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button
        label="Copy"
        icon="copy"
        variant="tonal"
        onPress={() => {
          copyText(text, name);
        }}
      />
      {more.available ? (
        <Button label="Load more" variant="text" loading={more.loading} onPress={more.load} />
      ) : null}
    </View>
  );
}

function ProjectFileBody({
  chatId,
  path,
}: {
  readonly chatId: string;
  readonly path: string;
}): ReactNode {
  const read = useScreenInfiniteQuery({
    queryKey: ['window', 'ai-project', chatId, path, 'text'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => readProjectText(chatId, path, pageParam),
    getNextPageParam: (page) => page.next_offset ?? undefined,
  });
  if (read.error !== null) {
    return (
      <LoadFailed
        what={leafName(path)}
        retry={() => {
          background(read.refetch(), 'read.refetch_failed');
        }}
      />
    );
  }
  if (read.data === undefined) return <RowsSkeleton />;
  const text = read.data.pages.map((page) => page.content ?? '').join('');
  return (
    <View className="gap-3 px-4 pb-4">
      <FileToolbar
        text={text}
        name={leafName(path)}
        more={{
          available: read.hasNextPage,
          loading: read.isFetchingNextPage,
          load: () => {
            background(read.fetchNextPage(), 'next_page.fetch_failed');
          },
        }}
      />
      <Text variant="footnote" selectable className="font-mono">
        {text}
      </Text>
    </View>
  );
}

function ProjectFileSheet({
  chatId,
  path,
  onClose,
}: {
  readonly chatId: string;
  readonly path: string | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={path !== null} onClose={onClose} title={path === null ? '' : leafName(path)}>
      {path === null ? null : <ProjectFileBody chatId={chatId} path={path} />}
    </Sheet>
  );
}

function EntryRow({
  entry,
  onFolder,
  onFile,
}: {
  readonly entry: AiProjectFile;
  readonly onFolder: (path: string) => void;
  readonly onFile: (path: string) => void;
}): ReactNode {
  const folder = entry.type === 'directory';
  return (
    <ListRow
      title={leafName(entry.path)}
      {...(folder ? {} : { subtitle: bytes(entry.bytes) })}
      leading={<IconWell icon={folder ? 'folder' : 'fileText'} colour="viz-1" size="m" />}
      chevron={folder}
      onPress={() => {
        if (folder) onFolder(entry.path);
        else onFile(entry.path);
      }}
    />
  );
}

function FolderRows({
  entries,
  path,
  onPath,
  onFile,
}: {
  readonly entries: readonly AiProjectFile[];
  readonly path: string;
  readonly onPath: (path: string) => void;
  readonly onFile: (path: string) => void;
}): ReactNode {
  const up = parentPath(path);
  return (
    <List title="Project files">
      {[
        up === null ? null : (
          <ListRow
            key="up"
            icon="chevronLeft"
            title={`Back to ${leafName(up)}`}
            onPress={() => {
              onPath(up);
            }}
          />
        ),
        ...entries.map((entry) => (
          <EntryRow key={entry.path} entry={entry} onFolder={onPath} onFile={onFile} />
        )),
        entries.length === 0 ? (
          <ListRow key="empty" icon="folder" title="Nothing here yet" />
        ) : null,
      ]}
    </List>
  );
}

export function ProjectFilesGroup({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [path, setPath] = useState(PROJECT_ROOT);
  const [viewing, setViewing] = useState<string | null>(null);
  const list = useProjectList(chat.id, path);
  if (list.error !== null) {
    return (
      <LoadFailed
        what="project files"
        retry={() => {
          background(list.refetch(), 'list.refetch_failed');
        }}
      />
    );
  }
  if (list.data === undefined) return <RowsSkeleton />;
  return (
    <>
      <FolderRows
        entries={sortedProjectEntries(list.data)}
        path={path}
        onPath={setPath}
        onFile={setViewing}
      />
      <ProjectFileSheet
        chatId={chat.id}
        path={viewing}
        onClose={() => {
          setViewing(null);
        }}
      />
    </>
  );
}
