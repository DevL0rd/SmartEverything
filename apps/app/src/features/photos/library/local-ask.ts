import type { PickedFile } from '../../../platform/pick-files';
import { resolveLocalMedia } from '../local/source';
import type { LocalMediaItem } from '../local/types';

export class LocalFileUnreadableError extends Error {
  constructor(
    readonly fileName: string,
    readonly reason: string,
  ) {
    super(`${fileName} could not be read from this device: ${reason}`);
    this.name = 'LocalFileUnreadableError';
  }
}

export async function localFileOf(item: LocalMediaItem): Promise<PickedFile> {
  const uri = await resolveLocalMedia(item.id);
  if (uri === null) throw new LocalFileUnreadableError(item.name, 'it is no longer on this device');
  const response = await fetch(uri);
  if (!response.ok) {
    throw new LocalFileUnreadableError(item.name, `the read ended with ${String(response.status)}`);
  }
  const blob = await response.blob();
  if (blob.type === '') throw new LocalFileUnreadableError(item.name, 'it has no media type');
  return {
    name: item.name,
    mime: blob.type,
    bytes: blob.size,
    preview: uri,
    data: () => blob.arrayBuffer(),
  };
}
