import { z } from 'zod';
import { physicalRoot, writeManifest } from '../drive/intents';
import { classify } from '../drive/scanner-commit';
import { writePhotoFolderReceipt } from './folder-receipts';
import type { BackupService, BackupEnv } from './backup';

const PENDING_UPLOAD = z.strictObject({ id: z.string(), name: z.string(), owner: z.string() });
const TRASH_ID = z.strictObject({ item_id: z.string() });

function photoOrVideo(name: string): boolean {
  const { kind } = classify(name);
  return kind === 'image' || kind === 'video';
}

async function retargetUploads(env: BackupEnv, service: BackupService): Promise<void> {
  const uploads = env.sql.all(
    PENDING_UPLOAD,
    `select u.id, u.name, r.owner_profile_id as owner from drive_uploads u
      join drive_items f on f.id = u.target_id join drive_roots r on r.id = f.root_id
      where u.state = 'open' and u.target_kind = 'folder' and r.kind = 'managed'
        and r.scope = 'person' and (f.rel_path in ('Camera roll', 'Uploads')
          or f.rel_path glob 'Camera roll/*' or f.rel_path glob 'Uploads/*')`,
  );
  for (const upload of uploads) {
    if (!photoOrVideo(upload.name)) continue;
    const folder = await service.manualTarget(upload.owner);
    env.sql.run(
      'retarget the existing photo upload',
      'update drive_uploads set target_id = $folderId where id = $id',
      { id: upload.id, folderId: folder.folderId },
    );
  }
}

async function retargetTrash(env: BackupEnv, service: BackupService): Promise<void> {
  const pending = env.sql.all(
    TRASH_ID,
    'select item_id from drive_photo_trash_folders order by item_id',
  );
  for (const row of pending) {
    const entry = env.store.driveTrash.byId(row.item_id);
    const root = env.store.driveRoots.byId(entry.rootId);
    if (photoOrVideo(entry.name) && root.ownerProfileId !== null) {
      const folder = await service.manualTarget(root.ownerProfileId);
      const originalRelPath = `${folder.path}/${entry.name}`;
      await writePhotoFolderReceipt(env, physicalRoot(root), {
        kind: 'trash',
        rootId: root.id,
        itemId: entry.itemId,
        fromPath: entry.originalRelPath,
        toPath: originalRelPath,
      });
      await writeManifest(env.files, physicalRoot(root), entry.trashRelPath, {
        ...entry,
        originalRelPath,
      });
      env.store.write(() => {
        env.sql.run(
          'retarget the deleted photo restoration',
          'update drive_trash set original_rel_path = $path where item_id = $id',
          { id: entry.itemId, path: originalRelPath },
        );
        env.sql.run(
          'finish the deleted photo folder migration',
          'delete from drive_photo_trash_folders where item_id = $id',
          { id: entry.itemId },
        );
      });
    } else {
      env.sql.run(
        'retain a non-media trash destination',
        'delete from drive_photo_trash_folders where item_id = $id',
        { id: entry.itemId },
      );
    }
  }
}

export async function migratePhotoPending(env: BackupEnv, service: BackupService): Promise<void> {
  await retargetUploads(env, service);
  await retargetTrash(env, service);
}
