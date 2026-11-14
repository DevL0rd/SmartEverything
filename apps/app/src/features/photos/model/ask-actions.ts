import type { DriveItem } from '@smarteverything/domain';
import type { PickedFile } from '../../../platform/pick-files';
import { driveLinks } from '../../drive';

export const NO_CHAT_HINT = 'Open a chat first, then come back to add this photo to it.';

async function originalOf(item: DriveItem): Promise<ArrayBuffer> {
  const url = await driveLinks.resolve(item.id, item.rev, 'file');
  if (url === null) throw new Error(`The hub gave no download link for ${item.name}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading ${item.name} failed with status ${String(response.status)}`);
  }
  return response.arrayBuffer();
}

export function pickedOf(item: DriveItem, preview: string | null): PickedFile | null {
  if (item.kind !== 'image' && item.kind !== 'video') return null;
  return {
    name: item.name,
    mime: item.mime,
    bytes: item.bytes,
    preview,
    data: () => originalOf(item),
  };
}
