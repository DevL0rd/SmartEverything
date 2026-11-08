import { describe, expect, it } from 'vitest';

describe('the Backup modules', () => {
  it('load with the real kit', { timeout: 240_000 }, async () => {
    const page = await import('./index');
    const chip = await import('../timeline/backup-chip');
    const merge = await import('../timeline/phone-merge');
    const route = await import('../../../../app/(app)/(photos)/photos/(sections)/backup');
    expect(typeof page.BackupScreen).toBe('function');
    expect(typeof page.UploadSheet).toBe('function');
    expect(typeof chip.BackupChip).toBe('function');
    expect(typeof chip.NotBackedUpChip).toBe('function');
    expect(typeof merge.useLocalMerge).toBe('function');
    expect(typeof route.default).toBe('function');
  });
});
