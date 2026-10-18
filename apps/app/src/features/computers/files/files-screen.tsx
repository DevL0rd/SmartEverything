import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { isNative, useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useFileDrop } from '../../../platform/file-drop';
import { ComputerFrame } from '../components/computer-frame';
import { useComputerReach } from '../data/computer-scopes';
import { bodyWidthOf } from '../model/sections';
import { SectionGate } from '../processes/section-gate';
import { DownloadSheet } from './download-sheet';
import { Content } from './files-content';
import { Top } from './files-top';
import { FileDialogs } from './file-dialogs';
import { sourceWord } from './file-model';
import { UploadSheet } from './upload-sheet';
import { useBrowse, type Browse } from './use-browse';
import { useDownloads, type Downloads } from './use-downloads';
import { useFileActions, type FileActions } from './use-file-actions';
import { useSelection, type Selection } from './use-selection';
import { useUploads, type Uploads } from './use-uploads';

const WIDE_FROM = 600;

function DropHint({ dragging }: { readonly dragging: boolean }): ReactNode {
  if (useIdiom() === 'touch') return null;
  return (
    <View
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-lg border border-dashed p-3',
        dragging ? 'border-primary bg-primary-container' : 'border-outline',
      )}
    >
      <Text variant="callout" tone="variant">
        Drop files here to upload them to this folder
      </Text>
    </View>
  );
}

function useDropping(uploads: Uploads): {
  readonly ref: React.RefObject<View | null>;
  readonly dragging: boolean;
} {
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: uploads.add, onHover: setDragging });
  return { ref, dragging };
}

function Footer({
  browse,
  dragging,
}: {
  readonly browse: Browse;
  readonly dragging: boolean;
}): ReactNode {
  return (
    <>
      {browse.pages.first === undefined || browse.searching ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {`${count(browse.pages.first.total)} items`}
        </Text>
      )}
      <DropHint dragging={dragging} />
    </>
  );
}

function Overlays({
  deviceId,
  name,
  browse,
  actions,
  uploads,
  downloads,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly browse: Browse;
  readonly actions: FileActions;
  readonly uploads: Uploads;
  readonly downloads: Downloads;
}): ReactNode {
  return (
    <>
      <FileDialogs
        deviceId={deviceId}
        machine={name}
        folder={browse.here}
        actions={actions}
        onGo={browse.go}
      />
      <UploadSheet
        queue={uploads.queue}
        machine={name}
        folder={browse.here}
        sourceWord={sourceWord(isNative())}
        open={uploads.open}
        onPick={uploads.pick}
        onClose={() => {
          uploads.setOpen(false);
        }}
      />
      <DownloadSheet flow={downloads.flow} state={downloads.state} machine={name} />
    </>
  );
}

interface FilesState {
  readonly browse: Browse;
  readonly selection: Selection;
  readonly downloads: Downloads;
  readonly actions: FileActions;
  readonly uploads: Uploads;
  readonly go: (path: string) => void;
}

function useFilesState(deviceId: string, online: boolean): FilesState {
  const { path } = useLocalSearchParams<{ path?: string }>();
  const browse = useBrowse(deviceId, online, path ?? null);
  const selection = useSelection();
  const downloads = useDownloads(deviceId);
  const go = (path: string): void => {
    selection.clear();
    browse.go(path);
  };
  const actions = useFileActions(deviceId, go, {
    download: downloads.flow.start,
    select: selection.toggle,
  });
  const present = new Set(browse.pages.entries.map((entry) => entry.name));
  const uploads = useUploads(deviceId, browse.here, present);
  return { browse, selection, downloads, actions, uploads, go };
}

function Files({
  deviceId,
  name,
  online,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly online: boolean;
}): ReactNode {
  const { browse, selection, downloads, actions, uploads, go } = useFilesState(deviceId, online);
  const { ref, dragging } = useDropping(uploads);
  const wide = bodyWidthOf(useAreaWidth()) >= WIDE_FROM;
  return (
    <View ref={ref} collapsable={false} className="min-h-0 flex-1 gap-3">
      <Top
        browse={browse}
        actions={actions}
        uploads={uploads}
        selection={selection}
        downloads={downloads}
        go={go}
        wide={wide}
        online={online}
        name={name}
      />
      <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        <Content
          browse={browse}
          actions={actions}
          selection={selection}
          wide={wide}
          online={online}
          name={name}
          onUpload={() => {
            uploads.setOpen(true);
          }}
        />
      </View>
      <Footer browse={browse} dragging={dragging} />
      <Overlays
        deviceId={deviceId}
        name={name}
        browse={browse}
        actions={actions}
        uploads={uploads}
        downloads={downloads}
      />
    </View>
  );
}

export function ComputerFilesScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const reach = useComputerReach(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Files" width="detail" scroll={false}>
      <SectionGate deviceId={deviceId} section="files" scope="files">
        <Files deviceId={deviceId} name={reach.name} online={reach.online} />
      </SectionGate>
    </ComputerFrame>
  );
}
