import { background } from '@smarteverything/logging';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { API_ENDPOINTS as E, type FileEntry } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useFileOps, type FileOps } from '../data/computer-files';
import { pickedFromContent, useChatAttach } from './chat-attach';
import type { DownloadTarget } from './download-flow';
import type { RowAction } from './file-model';

type FileDialog =
  | { readonly kind: 'none' }
  | { readonly kind: 'preview'; readonly path: string }
  | { readonly kind: 'properties'; readonly entry: FileEntry }
  | { readonly kind: 'rename'; readonly entry: FileEntry }
  | { readonly kind: 'folder' }
  | { readonly kind: 'path' }
  | {
      readonly kind: 'transfer';
      readonly entries: readonly FileEntry[];
      readonly mode: 'move' | 'copy';
    };

export interface FileActions {
  readonly dialog: FileDialog;
  readonly show: (dialog: FileDialog) => void;
  readonly close: () => void;
  readonly onAction: (action: RowAction, entry: FileEntry) => void;
  readonly ops: FileOps;
  readonly canAttach: boolean;
  readonly download: (targets: readonly DownloadTarget[]) => void;
}

export interface FileActionHandlers {
  readonly download: (targets: readonly DownloadTarget[]) => void;
  readonly select: (entry: FileEntry) => void;
}

function useAttach(deviceId: string): { canAttach: boolean; attach: (path: string) => void } {
  const chat = useChatAttach();
  const read = useMutation({
    mutationFn: (path: string) =>
      api().call(E.readComputerFile, { params: { deviceId }, query: { path } }),
    onSuccess: (content) => {
      chat.attach(pickedFromContent(content));
    },
    onError: (error) => {
      notify({ message: 'That file wasn’t added to the chat', error, tone: 'critical' });
    },
  });
  return {
    canAttach: chat.available,
    attach: (path): void => {
      read.mutate(path);
    },
  };
}

const DIALOG_FOR: Readonly<Partial<Record<RowAction, (entry: FileEntry) => FileDialog | null>>> = {
  open: (entry) => (entry.kind === 'folder' ? null : { kind: 'preview', path: entry.path }),
  rename: (entry) => ({ kind: 'rename', entry }),
  move: (entry) => ({ kind: 'transfer', entries: [entry], mode: 'move' }),
  copy: (entry) => ({ kind: 'transfer', entries: [entry], mode: 'copy' }),
  properties: (entry) => ({ kind: 'properties', entry }),
};

export function useFileActions(
  deviceId: string,
  go: (path: string) => void,
  handlers: FileActionHandlers,
): FileActions {
  const [dialog, setDialog] = useState<FileDialog>({ kind: 'none' });
  const ops = useFileOps(deviceId);
  const { canAttach, attach } = useAttach(deviceId);
  const direct: Readonly<Partial<Record<RowAction, (entry: FileEntry) => void>>> = {
    open: (entry) => {
      go(entry.path);
    },
    download: (entry) => {
      handlers.download([entry]);
    },
    select: handlers.select,
    attach: (entry) => {
      attach(entry.path);
    },
    trash: (entry) => {
      background(ops.run({ action: 'trash', paths: [entry.path] }), 'files.trash_failed');
    },
  };
  const onAction = useStableCallback((action: RowAction, entry: FileEntry): void => {
    const opened = DIALOG_FOR[action]?.(entry) ?? null;
    if (opened === null) direct[action]?.(entry);
    else setDialog(opened);
  });
  return {
    dialog,
    show: setDialog,
    close: (): void => {
      setDialog({ kind: 'none' });
    },
    onAction,
    ops,
    canAttach,
    download: handlers.download,
  };
}
