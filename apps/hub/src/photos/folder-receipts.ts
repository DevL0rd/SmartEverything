import { dirname } from 'node:path';
import { z } from 'zod';
import { locate, tmpRelPath, type DriveWriteRoot, type FileEnv } from '../drive/intents';
import { MARKER_DIRECTORY } from '../drive/root-marker';

export const PHOTO_FOLDER_RECEIPTS = `${MARKER_DIRECTORY}/migrations/photos-folder-201`;

const COMMON = { rootId: z.uuid(), itemId: z.uuid(), fromPath: z.string().min(1) };

export const PHOTO_FOLDER_RECEIPT = z.discriminatedUnion('kind', [
  z.strictObject({
    ...COMMON,
    kind: z.literal('file'),
    toPath: z.string().min(1),
    dev: z.string(),
    ino: z.string(),
    bytes: z.int().nonnegative(),
    mtimeNs: z.string(),
    sha256: z.string().nullable(),
  }),
  z.strictObject({ ...COMMON, kind: z.literal('trash'), toPath: z.string().min(1) }),
  z.strictObject({ ...COMMON, kind: z.literal('folder') }),
]);

export type PhotoFolderReceipt = Readonly<z.output<typeof PHOTO_FOLDER_RECEIPT>>;

export async function writePhotoFolderReceipt(
  env: FileEnv,
  root: DriveWriteRoot,
  receipt: PhotoFolderReceipt,
): Promise<void> {
  const parsed = PHOTO_FOLDER_RECEIPT.parse(receipt);
  await env.files.mkdir(await locate(root, PHOTO_FOLDER_RECEIPTS));
  await syncPhotoDirectories(env, root, PHOTO_FOLDER_RECEIPTS);
  const target = await locate(root, `${PHOTO_FOLDER_RECEIPTS}/${parsed.itemId}.json`);
  await env.files.writeDurable(target, await locate(root, tmpRelPath()), JSON.stringify(parsed));
}

export async function syncPhotoDirectories(
  env: FileEnv,
  root: DriveWriteRoot,
  relativeDirectory: string,
): Promise<void> {
  let directory = relativeDirectory;
  for (;;) {
    await env.files.syncDirectory(await locate(root, directory === '.' ? '' : directory));
    if (directory === '.' || directory === '') return;
    directory = dirname(directory);
  }
}
