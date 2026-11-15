import { Logger, background } from '@smarteverything/logging';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { FILE_PATH, type FilePlaces, type FileWriteChange } from '@smarteverything/domain';
import { useMemo } from 'react';
import { rawErrorText } from '../../../format/errors';
import { useStableCallback } from '../../../design/use-stable-callback';
import type { PickedFile } from '../../../platform/pick-files';
import {
  type FileAbilities,
  nodesOfOp,
  opAllowed,
  refusedOf,
  type FileOp,
  type OpResult,
  type FileLinks,
  type FileLocation,
  type FilePlace,
  type FileSearch,
  type FileSource,
  type FolderListing,
  type InfoRow,
  type ZipListing,
} from '../../files';
import {
  COMPUTER_TRASH_PLACE,
  abilitiesAtOf,
  computerAbilitiesOf,
  reachedAbilitiesOf,
} from './computer-abilities';
import { attachAction, attachable, useChatAttach } from './computer-attach';
import { placeOfPath } from './computer-crumbs';
import { prepareDownloadOf } from './computer-download';
import {
  useLinksData,
  usePropertiesData,
  useZipData,
  writeFiles,
  zipEntryLinkOf,
} from './computer-files-data';
import { infoRowsOf } from './computer-info';
import { filesKey, placesKey } from './computer-keys';
import { useComputerFolder, useComputerSearch } from './computer-listing';
import type { ComputerNode, ComputerOrigin } from './computer-node';
import { changeOfOp, mergedResults, opResultOf, undoChangesOf } from './computer-ops';
import { normalPath } from './computer-path';
import { useReach, type Reach } from './computer-reach';
import { computerUpload } from './computer-upload';

const log = new Logger('app.computers');

export type ComputerSource = FileSource<ComputerOrigin>;

export interface ComputerSourceInput {
  readonly deviceId: string;
  readonly label: string;
  readonly client: QueryClient;
  readonly attach: ((file: PickedFile) => void) | null;
}

function abilitiesAt(reach: Reach, location: FileLocation): FileAbilities {
  return abilitiesAtOf(reachedAbilitiesOf(reach), location.place === COMPUTER_TRASH_PLACE);
}

function failedOf(keys: readonly string[], error: unknown): OpResult {
  const reason = rawErrorText(error);
  return { done: [], failed: keys.map((key) => ({ key, reason })), undo: null };
}

function useLinks(deviceId: string, node: ComputerNode): FileLinks {
  const reach = useReach(deviceId);
  const live =
    reach.online && node.kind !== 'folder' && node.origin.trashId === null && node.exportable;
  const links = useLinksData(deviceId, node.origin.path, node.modifiedAt, live).data;
  const file = links?.file ?? null;
  return { file, thumb: links?.thumb ?? null, download: node.exportable ? file : null, icon: null };
}

function useZip(deviceId: string, node: ComputerNode | null): ZipListing {
  const reach = useReach(deviceId);
  const path = node?.origin.path ?? '';
  const enabled =
    reach.online && reach.granted.includes('zip') && node !== null && node.kind === 'archive';
  const zip = useZipData(deviceId, path, enabled);
  return {
    entries: zip.pages.flatMap((page) => page.items),
    totals: zip.pages[0]?.totals ?? null,
    loading: zip.loading,
    error: zip.error,
    more: zip.more,
    entryLink: (index) => zipEntryLinkOf(deviceId, path, index),
  };
}

function useInfo(deviceId: string, node: ComputerNode): readonly InfoRow[] {
  const reach = useReach(deviceId);
  const enabled =
    reach.online && reach.granted.includes('properties') && node.origin.trashId === null;
  const properties = usePropertiesData(deviceId, node.origin.path, enabled).data;
  return infoRowsOf(node, properties);
}

function keysOf(op: FileOp<ComputerOrigin>, change: FileWriteChange): readonly string[] {
  return change.action === 'new_folder' ? [change.path] : nodesOfOp(op).map((node) => node.key);
}

function keysOfChange(change: FileWriteChange): readonly string[] {
  switch (change.action) {
    case 'restore':
    case 'delete_now':
      return change.items;
    case 'move':
    case 'copy':
    case 'trash':
      return change.paths;
    case 'new_folder':
    case 'rename':
      return [change.path];
  }
}

interface Writer {
  readonly run: (op: FileOp<ComputerOrigin>) => Promise<OpResult>;
  readonly refresh: () => void;
}

function writerOf(deviceId: string, client: QueryClient): Writer {
  const grantedNow = (): FilePlaces['abilities'] =>
    client.getQueryData<FilePlaces>(placesKey(deviceId))?.abilities ?? [];
  const refresh = (): void => {
    background(
      client.invalidateQueries({ queryKey: filesKey(deviceId) }),
      'queries.invalidate_failed',
    );
  };
  const execute = async (
    change: FileWriteChange,
    keys: readonly string[],
    undoable: boolean,
  ): Promise<OpResult> => {
    try {
      const result = await writeFiles(deviceId, change);
      refresh();
      const back = undoable ? undoChangesOf(change, result) : [];
      const undo =
        back.length === 0
          ? null
          : async (): Promise<OpResult> =>
              mergedResults(
                await Promise.all(back.map((step) => execute(step, keysOfChange(step), false))),
              );
      return opResultOf(result, undo);
    } catch (error) {
      log.error('files.write_failed', error, { deviceId, action: change.action });
      return failedOf(keys, error);
    }
  };
  const run = (op: FileOp<ComputerOrigin>): Promise<OpResult> => {
    const change = changeOfOp(op);
    if (change === null || !opAllowed(op, computerAbilitiesOf(grantedNow()))) {
      return Promise.resolve(refusedOf(op, 'This can’t be done on this computer.'));
    }
    return execute(change, keysOf(op, change), true);
  };
  return { run, refresh };
}

export function createComputerSource(input: ComputerSourceInput): ComputerSource {
  const { deviceId, client } = input;
  const writer = writerOf(deviceId, client);
  return {
    id: `computer-${deviceId}`,
    label: input.label,
    useAbilities: (location): FileAbilities => abilitiesAt(useReach(deviceId), location),
    usePlaces: (): readonly FilePlace[] => useReach(deviceId).places,
    useFolder: (location, sort): FolderListing<ComputerOrigin> => {
      const reach = useReach(deviceId);
      const abilities = abilitiesAt(reach, location);
      return useComputerFolder({ deviceId, reach, abilities, location }, sort);
    },
    useSearch: (location, query): FileSearch<ComputerOrigin> => {
      const reach = useReach(deviceId);
      const abilities = abilitiesAt(reach, location);
      return useComputerSearch({ deviceId, reach, abilities, location }, query);
    },
    useLinks: (node): FileLinks => useLinks(deviceId, node),
    useZip: (node): ZipListing => useZip(deviceId, node),
    useInfo: (node): readonly InfoRow[] => useInfo(deviceId, node),
    infoSections: () => [],
    locationOf: (typed): FileLocation | null => {
      const parsed = FILE_PATH.safeParse(typed.trim());
      return parsed.success ? placeOfPath(normalPath(parsed.data)) : null;
    },
    run: writer.run,
    upload: computerUpload(deviceId, writer.refresh),
    download: (nodes) => prepareDownloadOf(deviceId, nodes),
    actions: (nodes) =>
      input.attach !== null && attachable(nodes) ? [attachAction(deviceId, input.attach)] : [],
    tabs: () => [],
  };
}

export function useComputerSource(deviceId: string, label: string): ComputerSource {
  const client = useQueryClient();
  const chat = useChatAttach();
  const attach = useStableCallback(chat.attach);
  const available = chat.available;
  return useMemo(
    () => createComputerSource({ deviceId, label, client, attach: available ? attach : null }),
    [deviceId, label, client, attach, available],
  );
}
