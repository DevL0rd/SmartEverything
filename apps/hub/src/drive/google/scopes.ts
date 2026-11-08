export const SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';

export const SCOPE_PHOTOS_PICKER =
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export const PICKER_API = 'https://photospicker.googleapis.com/v1';

export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.';

export const DRIVE_FOLDER = 'Google Drive';

export const PHOTOS_FOLDER = 'Google Photos';

export const IMPORT_SOURCES = ['drive', 'photos'] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_LIMITS = [
  'photos_only_picked_items',
  'photos_no_location',
  'photos_no_description',
] as const;

export type ImportLimit = (typeof IMPORT_LIMITS)[number];
