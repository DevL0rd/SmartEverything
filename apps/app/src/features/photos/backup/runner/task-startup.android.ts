import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { Logger } from '@smarteverything/logging';
import { BACKUP_TASK_NAME } from './background';
import { runHeadlessBackup } from './headless';

const log = new Logger('app.photos');

TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
  try {
    await runHeadlessBackup();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    log.warn('backup.task_failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
