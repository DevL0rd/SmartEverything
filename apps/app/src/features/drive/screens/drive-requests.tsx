import { useEffect, useEffectEvent, type ReactNode } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useValue } from '../../../design/external-store';
import { rememberTab, type FileBrowserHandle, FilePickerSheet, type FileSource } from '../../files';
import { FolderColourSheet } from '../components/folder-colour';
import { useDriveRoots, useShortcutCreate, useViewerId } from '../data';
import { useFileRequestSheet } from '../requests/file-request-sheet';
import { useShareSheet } from '../share/share-sheet';
import { closeDriveRequest, driveRequests, type DriveRequest } from '../source/drive-actions';
import { itemOf, type DriveNode, type DriveOrigin } from '../source/drive-node';
import { folderPlaceOf } from '../source/drive-places';

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

const ITSELF_TEXT = 'A folder cannot hold a shortcut to itself. Pick another folder.';

const NO_PLACE_TEXT = 'A shortcut can only go in a folder of My Drive or the Shared Drive.';

function folderOf(item: DriveItem | null): Folder | null {
  return item?.kind === 'folder' ? item : null;
}

function firstItemOf(request: DriveRequest | null): DriveItem | null {
  const node = request?.nodes[0];
  return node === undefined ? null : itemOf(node);
}

function ShortcutPicker({
  source,
  target,
  start,
}: {
  readonly source: FileSource<DriveOrigin>;
  readonly target: DriveItem;
  readonly start: FileBrowserHandle<DriveOrigin>['location'];
}): ReactNode {
  const create = useShortcutCreate();
  const roots = useDriveRoots();
  const viewerId = useViewerId();
  return (
    <FilePickerSheet
      open
      source={source}
      mode="folder"
      writableOnly
      start={start}
      title={`Add a shortcut to ${target.name}`}
      refusalOf={(here) => (here.location.folder === target.id ? ITSELF_TEXT : null)}
      onClose={closeDriveRequest}
      onChoose={(choice) => {
        if (choice.kind !== 'folder') return;
        const place = folderPlaceOf(choice.location, roots, viewerId);
        if (place === null) {
          notify({ message: NO_PLACE_TEXT, tone: 'critical' });
          return;
        }
        create.run({ targetItemId: target.id, place, name: target.name });
      }}
    />
  );
}

function openComments(browser: FileBrowserHandle<DriveOrigin>, node: DriveNode): void {
  rememberTab('comments');
  browser.commands.focus(node);
  browser.commands.setPanel('quickLook', false);
  browser.commands.setPanel('details', true);
}

export function DriveRequests({
  browser,
}: {
  readonly browser: FileBrowserHandle<DriveOrigin>;
}): ReactNode {
  const request = useValue(driveRequests);
  const share = useShareSheet();
  const fileRequests = useFileRequestSheet();
  const handle = useEffectEvent((asked: DriveRequest) => {
    if (asked.kind === 'shortcut' || asked.kind === 'colour') return;
    closeDriveRequest();
    const node = asked.nodes[0];
    const item = node === undefined ? null : itemOf(node);
    if (node === undefined || item === null) return;
    if (asked.kind === 'share') share.open({ item });
    else if (asked.kind === 'fileRequest') fileRequests.open(item);
    else openComments(browser, node);
  });
  useEffect(() => {
    if (request !== null) handle(request);
  }, [request]);
  const item = firstItemOf(request);
  return (
    <>
      {share.host}
      {fileRequests.host}
      {request?.kind === 'shortcut' && item !== null ? (
        <ShortcutPicker source={browser.source} target={item} start={browser.location} />
      ) : null}
      <FolderColourSheet
        folder={request?.kind === 'colour' ? folderOf(item) : null}
        onClose={closeDriveRequest}
      />
    </>
  );
}
