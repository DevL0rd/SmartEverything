import type { FlowType } from '../automation-v3/types';
import { DRIVE_ITEM_KINDS } from '../drive/item';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';
import {
  DRIVE_CONFLICT_KIND,
  DRIVE_INTEGRITY_KIND,
  DRIVE_ITEM_ADDED_KIND,
  DRIVE_SIGNAL_SOURCE,
} from './drive-signals';
import { ERROR_OUT } from './error-port';
import { AT, TEXT, choice, input, output, trigger } from './trigger-parts';
import type { MatcherMapping } from './triggers-device';

const BOOLEAN: FlowType = { t: 'boolean' };

const ITEM_KIND: FlowType = choice(DRIVE_ITEM_KINDS);

export const DRIVE_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  'trigger.drive_item_added': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: DRIVE_SIGNAL_SOURCE, kind: DRIVE_ITEM_ADDED_KIND } },
    subjectPort: null,
    fieldPort: null,
    matchPorts: { root: 'rootId', folder: 'folderId', kind: 'kind' },
    runtimePorts: [],
    outputs: {
      itemId: 'itemId',
      root: 'rootId',
      folder: 'folderId',
      name: 'name',
      path: 'relPath',
      kind: 'kind',
      via: 'via',
    },
  },
  'trigger.drive_conflict': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: DRIVE_SIGNAL_SOURCE, kind: DRIVE_CONFLICT_KIND } },
    subjectPort: null,
    fieldPort: null,
    matchPorts: { root: 'rootId' },
    runtimePorts: [],
    outputs: {
      conflictId: 'conflictId',
      itemId: 'itemId',
      conflictItemId: 'conflictItemId',
      root: 'rootId',
      path: 'relPath',
      conflictPath: 'conflictRelPath',
      device: 'deviceId',
    },
  },
  'trigger.drive_integrity': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: DRIVE_SIGNAL_SOURCE, kind: DRIVE_INTEGRITY_KIND } },
    subjectPort: null,
    fieldPort: null,
    matchPorts: { root: 'rootId' },
    runtimePorts: [],
    outputs: { itemId: 'itemId', root: 'rootId', path: 'relPath' },
  },
};

const ROOT_INPUT = input(
  'root',
  TEXT,
  'Only this library folder. Leave empty for every library folder.',
  { ui: { label: 'Library folder' } },
);

const ITEM_ADDED = trigger({
  tier: 'v1.1',
  id: 'trigger.drive_item_added',
  name: 'Item added to the library',
  icon: 'folder-input',
  description:
    'Starts when a photo, video, file or folder appears in the library, whether it was uploaded, synced, saved by an automation or found by a scan. Narrow it to one library folder, to the items directly inside one folder, or to one kind of item; leave them empty for every new item.',
  inputs: [
    ROOT_INPUT,
    input('folder', TEXT, 'Only items directly inside this folder.', {
      ui: { label: 'Folder' },
    }),
    input('kind', ITEM_KIND, 'Only this kind of item.', { ui: { label: 'Kind' } }),
  ],
  outputs: [
    output('itemId', TEXT, 'The id of the new item.'),
    output('root', TEXT, 'The library folder it is in.'),
    output('folder', TEXT, 'The folder it is directly inside.', true),
    output('name', TEXT, 'Its name.'),
    output('path', TEXT, 'Its path inside the library folder.'),
    output('kind', ITEM_KIND, 'What kind of item it is.'),
    output(
      'via',
      TEXT,
      'How it arrived: app, ai, automation, mount, sync, scan, share or outside.',
    ),
    AT,
  ],
  summary: 'When an item is added to the library',
  keywords: ['drive', 'photos', 'library', 'file', 'upload', 'added', 'new', 'photo', 'video'],
});

const CONFLICT = trigger({
  tier: 'v1.1',
  id: 'trigger.drive_conflict',
  name: 'Sync conflict',
  icon: 'file-warning',
  description:
    'Starts when a synced file was changed on two sides and the hub kept a conflict copy next to it. Narrow it to one library folder, or leave it empty for every one.',
  inputs: [ROOT_INPUT],
  outputs: [
    output('conflictId', TEXT, 'The id of the conflict.'),
    output('itemId', TEXT, 'The id of the file the hub kept.'),
    output('conflictItemId', TEXT, 'The id of the conflict copy.'),
    output('root', TEXT, 'The library folder it is in.'),
    output('path', TEXT, 'Where the file is.'),
    output('conflictPath', TEXT, 'Where the conflict copy is.'),
    output('device', TEXT, 'The id of the synced device whose change conflicted.'),
    AT,
  ],
  summary: 'When a synced file has a conflict',
  keywords: ['drive', 'sync', 'conflict', 'copy', 'file', 'clash'],
});

const INTEGRITY = trigger({
  tier: 'v1.1',
  id: 'trigger.drive_integrity',
  name: 'File failed integrity check',
  icon: 'shield-alert',
  description:
    'Starts when a check of the stored bytes finds a library file that no longer matches what was recorded, so it may be corrupt. Narrow it to one library folder, or leave it empty for every one.',
  inputs: [ROOT_INPUT],
  outputs: [
    output('itemId', TEXT, 'The id of the file.'),
    output('root', TEXT, 'The library folder it is in.'),
    output('path', TEXT, 'Where the file is.'),
    AT,
  ],
  summary: 'When a library file fails its integrity check',
  keywords: ['drive', 'integrity', 'corrupt', 'scrub', 'checksum', 'damaged', 'file'],
});

const ITEM_INPUT: InputPortDecl = {
  name: 'item',
  type: TEXT,
  required: true,
  live: true,
  description: 'The id of the library item, such as the one a library trigger gave.',
  summary: true,
  ui: { label: 'Item' },
};

const ADD_TO_ALBUM = defineNodeKind({
  id: 'drive.add_to_album',
  name: 'Add to album',
  category: 'utilities',
  icon: 'image-plus',
  class: 'effect',
  description:
    'Adds a photo, video or file to a manual album of the library. Adding an item that is already in the album changes nothing. It fails when the album is not one you can change, or when the item is not one you can see.',
  inputs: [
    ITEM_INPUT,
    {
      name: 'album',
      type: TEXT,
      required: true,
      live: true,
      description: 'The id of the album.',
      summary: true,
      ui: { label: 'Album' },
    },
  ],
  outputs: [{ name: 'ok', type: BOOLEAN, description: 'Whether it is in the album.' }, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Add {item} to album {album}',
  keywords: ['drive', 'photos', 'album', 'add', 'collect', 'library'],
  access: 'member',
  tier: 'v1.1',
});

const KEEP = defineNodeKind({
  id: 'drive.keep',
  name: 'Keep in the library',
  category: 'utilities',
  icon: 'folder-down',
  class: 'effect',
  description:
    'Copies a library item into a library folder so it stays when the original goes, for example to keep a camera recording. The copy gets its own id, which comes out so a later step can use it. It fails when the folder already holds an item of that name.',
  inputs: [
    ITEM_INPUT,
    {
      name: 'folder',
      type: TEXT,
      required: true,
      live: true,
      description: 'The id of the library folder to keep it in.',
      summary: true,
      ui: { label: 'Folder' },
    },
  ],
  outputs: [{ name: 'itemId', type: TEXT, description: 'The id of the kept copy.' }, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Keep {item} in {folder}',
  keywords: ['drive', 'keep', 'save', 'copy', 'library', 'camera', 'recording', 'photos'],
  access: 'member',
  tier: 'v1.1',
});

export const DRIVE_TRIGGER_KINDS: readonly NodeKind[] = [ITEM_ADDED, CONFLICT, INTEGRITY];

export const DRIVE_KINDS: readonly NodeKind[] = [...DRIVE_TRIGGER_KINDS, ADD_TO_ALBUM, KEEP];
