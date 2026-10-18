import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { FileList } from '@smarteverything/domain';
import { useComputerFolder } from '../data/computer-files';

export interface FolderBrowse {
  readonly folder: UseQueryResult<FileList>;
  readonly home: string | null;
  readonly here: string | null;
  readonly path: string | null;
  readonly picked: string | null;
  readonly showHidden: boolean;
  readonly setShowHidden: (value: boolean) => void;
  readonly pick: (path: string) => void;
  readonly go: (path: string) => void;
}

export function useFolderBrowse(
  deviceId: string,
  start: string | null,
  ready: boolean,
): FolderBrowse {
  const [path, setPath] = useState<string | null>(start);
  const [picked, setPicked] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const folder = useComputerFolder(deviceId, path, ready);
  const home = useComputerFolder(deviceId, null, ready).data?.path ?? null;
  return {
    folder,
    home,
    here: folder.data?.path ?? null,
    path,
    picked,
    showHidden,
    setShowHidden,
    pick: setPicked,
    go: (next: string): void => {
      setPath(next);
      setPicked(null);
    },
  };
}
