import type { Served } from './served-types';

export const DRIVE_READ_VIEWS = [
  'roots',
  'folder',
  'timeline',
  'item',
  'search',
  'albums',
  'album',
  'trash',
  'stats',
  'duplicates',
  'memories',
  'places',
  'stacks',
  'backup',
  'recent',
  'versions',
  'shares',
  'usage',
  'health',
  'sync',
  'conflicts',
] as const;

export const DRIVE_EDIT_ACTIONS = [
  'add_root',
  'scan',
  'new_folder',
  'rename',
  'move',
  'copy',
  'star',
  'trash',
  'restore',
  'album_create',
  'album_update',
  'album_add',
  'album_remove',
  'make_memory_album',
  'keep',
  'attach_to_chat',
  'version_restore',
  'share_create',
  'share_revoke',
  'conflict_resolve',
  'sync_set',
  'scrub_start',
] as const;

export const SERVED_DRIVE = [
  {
    name: 'drive_read',
    area: 'drive',
    access: 'read',
    title: 'Read Photos and Drive',
    line: 'Library folders, files, photos, albums and health',
    description:
      'The person’s library of files and photos (personId from person_read; you when left out): roots lists library folders, folder one folder’s files, timeline the photo months or one month, item one file, search files by name and filters, albums and album, trash, stats, duplicates, memories, places, stacks, backup (phones backing up), recent, versions of a file, shares (links), usage, health, sync (devices) and conflicts. Returns ids drive_edit takes.',
    route: { custom: true },
  },
  {
    name: 'drive_edit',
    area: 'drive',
    access: 'control',
    title: 'Edit Photos and Drive',
    line: 'Folders, files, albums, shares and sync',
    description:
      'Changes the person’s library (personId from person_read; you when left out): add_root or scan a library folder, new_folder, rename, move, copy, star, trash or restore files, create or change albums, album_add and album_remove, make_memory_album, keep camera or AI images, attach_to_chat to look at a photo, version_restore, share_create (answers with the link and how to revoke it) and share_revoke, conflict_resolve, sync_set and scrub_start. Files are never deleted for good here. Ids come from drive_read.',
    route: { custom: true },
  },
] as const satisfies readonly Served[];
