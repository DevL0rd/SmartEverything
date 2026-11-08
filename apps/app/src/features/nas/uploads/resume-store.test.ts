import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './fixtures';
import { PersistedUrlStorage, RESUME_STORAGE_KEY } from './resume-store';
import type { TusPreviousUpload } from './tus-types';

function previous(url: string): TusPreviousUpload {
  return {
    size: 10,
    metadata: { filename: 'a.jpg' },
    creationTime: '2026-11-07T10:00:00.000Z',
    urlStorageKey: '',
    uploadUrl: url,
    parallelUploadUrls: null,
  };
}

describe('persisted resume store', () => {
  it('survives a new instance over the same storage and finds by fingerprint', async () => {
    const memory = new MemoryStorage();
    const key = await new PersistedUrlStorage(memory).addUpload('f1', previous('/drive/uploads/1'));
    await new PersistedUrlStorage(memory).addUpload('f2', previous('/drive/uploads/2'));
    const reopened = new PersistedUrlStorage(memory);
    const found = await reopened.findUploadsByFingerprint('f1');
    expect(found).toEqual([{ ...previous('/drive/uploads/1'), urlStorageKey: key }]);
    expect(await reopened.findAllUploads()).toHaveLength(2);
  });

  it('removes one upload by its key', async () => {
    const storage = new PersistedUrlStorage(new MemoryStorage());
    const key = await storage.addUpload('f1', previous('/drive/uploads/1'));
    await storage.addUpload('f2', previous('/drive/uploads/2'));
    await storage.removeUpload(key);
    expect(await storage.findUploadsByFingerprint('f1')).toEqual([]);
    expect(await storage.findAllUploads()).toHaveLength(1);
  });

  it('starts empty when the stored text is unreadable', async () => {
    const memory = new MemoryStorage();
    memory.values.set(RESUME_STORAGE_KEY, '{"broken":');
    expect(await new PersistedUrlStorage(memory).findAllUploads()).toEqual([]);
  });
});

it('keeps resume URLs isolated between paired backup scopes', async () => {
  const memory = new MemoryStorage();
  const first = new PersistedUrlStorage(memory, 'backup.server-a');
  const second = new PersistedUrlStorage(memory, 'backup.server-b');
  await first.addUpload('same-asset', previous('/drive/uploads/old-server'));
  expect(await second.findUploadsByFingerprint('same-asset')).toEqual([]);
  expect(await first.findUploadsByFingerprint('same-asset')).toHaveLength(1);
});
