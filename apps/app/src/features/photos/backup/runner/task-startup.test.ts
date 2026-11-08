import { describe, expect, it, vi } from 'vitest';

const task = vi.hoisted(() => ({ define: vi.fn(), run: vi.fn() }));
vi.mock('expo-task-manager', () => ({ defineTask: task.define }));
vi.mock('expo-background-task', () => ({ BackgroundTaskResult: { Success: 1, Failed: 2 } }));
vi.mock('./headless', () => ({ runHeadlessBackup: task.run }));

const { BACKUP_TASK_NAME } = await import('./background');
await import('./task-startup.android');

describe('photo task module startup', () => {
  it('defines the task synchronously during module evaluation before registration', () => {
    expect(task.define).toHaveBeenCalledOnce();
    expect(task.define).toHaveBeenCalledWith(BACKUP_TASK_NAME, expect.any(Function));
  });
});
