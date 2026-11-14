import { describe, expect, it } from 'vitest';

describe('the Backup modules', () => {
  it('load with the real kit', { timeout: 240_000 }, async () => {
    const page = await import('./index');
    const chip = await import('../library/backup-chip');
    const merge = await import('../library/phone-merge');
    expect(typeof page.BackupSettingsScreen).toBe('function');
    expect(typeof page.UploadSheet).toBe('function');
    expect(typeof chip.BackupChip).toBe('function');
    expect(typeof chip.NotBackedUpChip).toBe('function');
    expect(typeof merge.useLocalMerge).toBe('function');
  });
});
