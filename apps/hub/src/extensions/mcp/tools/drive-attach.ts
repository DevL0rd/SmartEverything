import { API_ENDPOINTS as E, type DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { DrivePathError, openResolved, resolveInRoot } from '../../../drive/paths';
import { operate, type OperatingContext } from './acting';
import { ToolError } from './registry';
import { selection, SelectionImages, type Selection } from './selected-tool';

const INLINE_BYTES_MAX = 4 * 1024 * 1024;
const LOOKABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

type DriveFile = Exclude<DriveItem, { readonly kind: 'folder' }>;

function lookable(item: DriveItem): DriveFile {
  if (item.kind !== 'image' || !LOOKABLE.has(item.mime)) {
    throw new ToolError(
      `${item.name} is not a PNG, JPEG, GIF or WebP image, so it cannot be shown to you.`,
    );
  }
  if (item.bytes > INLINE_BYTES_MAX) {
    throw new ToolError(
      `${item.name} is larger than 4 MB, so it cannot be shown to you; its preview is available to the person in the app.`,
    );
  }
  return item;
}

async function bytesOf(context: OperatingContext, item: DriveFile): Promise<Buffer> {
  const path = context.store.driveRoots.find(item.rootId)?.path ?? null;
  if (path === null) {
    throw new ToolError(`${item.name} is not stored on this hub.`);
  }
  try {
    const handle = await openResolved(await resolveInRoot(path, item.relPath), 'read');
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch (cause) {
    if (cause instanceof DrivePathError) {
      throw new ToolError(`${item.name} is not available on disk.`);
    }
    throw cause;
  }
}

export function attachToChat(): Selection {
  return selection({
    input: z.strictObject({ itemId: z.uuid() }),
    run: async (context, input, as) => {
      const item = E.readItem.response.parse(
        await operate(context, 'readItem', { params: { itemId: input.itemId } }, as),
      );
      const file = lookable(item);
      const content = await bytesOf(context, file);
      return new SelectionImages(
        { itemId: file.id, name: file.name, mime: file.mime, bytes: file.bytes },
        [{ data: content.toString('base64'), mimeType: file.mime }],
      );
    },
  });
}
