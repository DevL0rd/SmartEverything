import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { useSyncStatus } from '../../../store/selectors';
import {
  NodeListFrame,
  useNodeList,
  type FileAbilities,
  type FileBrowserHandle,
  type FileLocation,
  type FilePlace,
} from '../../files';
import { useByName } from '../components/use-by-name';
import { nativeDriveProvider } from '../phone/provider';
import { driveAbilitiesOf } from './drive-abilities';
import { useDriveNodeContext } from './drive-location';
import { driveNodeOf, type DriveNode, type DriveNodeContext, type DriveOrigin } from './drive-node';
import { DRIVE_PLACES } from './drive-places';
import { useDriveSource } from './drive-source';

export type DriveListKind = 'items' | 'trash';

function listHrefOf(location: FileLocation): AppHref {
  return location.folder === null ? href.drive() : href.driveFolder(location.folder);
}

export function driveListAbilitiesOf(
  kind: DriveListKind,
  input: { readonly online: boolean; readonly phone: boolean },
): FileAbilities {
  const place = kind === 'trash' ? DRIVE_PLACES.trash : DRIVE_PLACES.myDrive;
  const full = driveAbilitiesOf({ ...input, place, atTop: false, access: 'own' });
  return {
    ...full,
    newFolder: false,
    upload: false,
    uploadResume: false,
    pathEntry: false,
    places: false,
    dragMove: false,
    kindFilter: false,
    hidden: false,
    searchNames: false,
    searchContents: false,
  };
}

export function useDriveList(
  list: string,
  kind: DriveListKind,
  nodes: readonly DriveNode[],
): FileBrowserHandle<DriveOrigin> {
  const router = useRouter();
  const online = useSyncStatus().status === 'live';
  const place: FilePlace = {
    key: DRIVE_PLACES.trash,
    label: 'Trash',
    kind: 'trash',
    location: { place: DRIVE_PLACES.trash, folder: null },
  };
  return useNodeList({
    source: useDriveSource(),
    list: kind === 'trash' ? DRIVE_PLACES.trash : list,
    place: kind === 'trash' ? place : null,
    nodes,
    abilities: driveListAbilitiesOf(kind, { online, phone: nativeDriveProvider.linked() }),
    host: {
      hrefOf: listHrefOf,
      onOpenFolder: (target) => {
        router.push(listHrefOf(target));
      },
      byName: useByName(),
    },
  });
}

export interface DriveItemList {
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly nodes: readonly DriveNode[];
}

export function useDriveNodeList(
  list: string,
  build: (context: DriveNodeContext) => readonly DriveNode[],
): DriveItemList {
  const nodes = build(useDriveNodeContext());
  return { browser: useDriveList(list, 'items', nodes), nodes };
}

export function useDriveItemList(list: string, items: readonly DriveItem[]): DriveItemList {
  return useDriveNodeList(list, (context) => items.map((item) => driveNodeOf(item, context)));
}

export function DriveListFrame({
  browser,
  children,
}: {
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <NodeListFrame browser={browser} from="Drive">
      {children}
    </NodeListFrame>
  );
}
