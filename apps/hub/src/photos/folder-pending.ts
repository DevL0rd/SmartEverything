import { writeManifest } from '../drive/intents';
import { classify } from '../drive/file-type';
import { writePhotoFolderReceipt } from './folder-receipts';
import type { BackupService, BackupEnv } from './backup';

function photoOrVideo(name: string): boolean {
  const { kind } = classify(name);
  return kind === 'image' || kind === 'video';
}

async function retargetUploads(env: BackupEnv, service: BackupService): Promise<void> {
  const { host } = env.store;
  for (const upload of await host.read('photoPendingUploads', null)) {
    if (!photoOrVideo(upload.name)) continue;
    const folder = await service.manualTarget(upload.owner);
    await host.write('photoUploadRetarget', { id: upload.id, folderId: folder.folderId });
  }
}

async function retargetTrash(env: BackupEnv, service: BackupService): Promise<void> {
  const { host } = env.store;
  for (const { entry, root } of await host.read('photoTrashFolders', null)) {
    if (photoOrVideo(entry.name) && root.ownerProfileId !== null) {
      const folder = await service.manualTarget(root.ownerProfileId);
      const originalRelPath = `${folder.path}/${entry.name}`;
      await writePhotoFolderReceipt(env, root, {
        kind: 'trash',
        rootId: root.id,
        itemId: entry.itemId,
        fromPath: entry.originalRelPath,
        toPath: originalRelPath,
      });
      await writeManifest(env.files, root, entry.trashRelPath, {
        ...entry,
        originalRelPath,
      });
      await host.write('photoTrashRetarget', { id: entry.itemId, path: originalRelPath });
    } else {
      await host.write('photoTrashRetain', { id: entry.itemId });
    }
  }
}

export async function migratePhotoPending(env: BackupEnv, service: BackupService): Promise<void> {
  await retargetUploads(env, service);
  await retargetTrash(env, service);
}
