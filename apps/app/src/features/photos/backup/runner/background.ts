import { Logger } from '@smarteverything/logging';

const log = new Logger('app.photos');

export const BACKUP_TASK_NAME = 'smarteverything.photos.backup';

let slot: Promise<void> = Promise.resolve();
let wanted: boolean | null = null;

async function updateSlot(enabled: boolean): Promise<void> {
  const [manager, background] = await Promise.all([
    import('expo-task-manager'),
    import('expo-background-task'),
  ]);
  const registered = await manager.isTaskRegisteredAsync(BACKUP_TASK_NAME);
  if (enabled && !registered) {
    await background.registerTaskAsync(BACKUP_TASK_NAME);
    log.info('backup.slot_registered');
  }
  if (!enabled && registered) {
    await background.unregisterTaskAsync(BACKUP_TASK_NAME);
    log.info('backup.slot_unregistered');
  }
}

export function syncBackupSlot(enabled: boolean): Promise<void> {
  if (wanted === enabled) return slot;
  wanted = enabled;
  slot = slot
    .catch((error: unknown) => {
      log.warn('backup.previous_slot_failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
    })
    .then(() => updateSlot(enabled))
    .catch((error: unknown) => {
      wanted = null;
      throw error;
    });
  return slot;
}
