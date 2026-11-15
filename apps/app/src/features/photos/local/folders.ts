import {
  phoneFolderPath,
  photoFolderKey,
  type PhotoFolderKey,
  type PhotoFolderOrigin,
} from '@smarteverything/domain';

export interface LocalFolder {
  readonly key: PhotoFolderKey;
  readonly name: string;
}

export interface DeviceFolder extends LocalFolder {
  readonly backupId: string;
}

export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}

export function phoneFolderOf(relativePath: string): LocalFolder | null {
  const path = phoneFolderPath(relativePath);
  return path === null ? null : { key: photoFolderKey('phone', path), name: lastSegment(path) };
}

export function computerFolderOf(path: string): LocalFolder {
  return { key: photoFolderKey('computer', path), name: lastSegment(path) };
}

export function computerDeviceFolderOf(path: string): DeviceFolder {
  return { ...computerFolderOf(path), backupId: path };
}

export function backupOriginOf(
  platform: 'android' | 'ios' | 'desktop',
  relativePath: string,
): PhotoFolderOrigin | null {
  if (platform === 'desktop') {
    return relativePath.length === 0 ? null : computerFolderOf(relativePath);
  }
  return phoneFolderOf(relativePath);
}
