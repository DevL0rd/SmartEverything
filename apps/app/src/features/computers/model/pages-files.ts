import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const FILES_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'files',
    title: 'Files',
    subtitle: 'Browse, search, upload and manage files on this computer',
    icon: 'folder',
    keywords: [
      'files',
      'folders',
      'browse',
      'path',
      'preview',
      'attach',
      'upload',
      'rename',
      'trash',
      'copy',
      'move',
    ],
    settings: [
      'Show hidden files',
      'Enter path',
      'Choose folder',
      'Choose file',
      'Attach to chat',
      'Search in this folder',
      'New folder',
      'Upload',
      'Rename',
      'Move to…',
      'Copy to…',
      'Move to Trash',
      'Properties',
    ],
  },
];
