import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadHandle, UploadRequest } from '../../drive';

vi.mock('../../drive/upload/transport/client', () => ({ startUpload: vi.fn() }));

import {
  identityOf,
  pauseUploads,
  resumeUploads,
  uploadFiles,
  uploadPath,
  type UploadDeps,
} from './uploads';

const FOLDER = '00000000-0000-4000-8000-0000000000f1';

function picked(name: string, bytes: number): PickedBlob {
  const blob = new Blob([new Uint8Array(bytes)]);
  return {
    name,
    mime: 'image/jpeg',
    bytes,
    preview: null,
    data: () => blob.arrayBuffer(),
    blob: () => Promise.resolve(blob),
  };
}

interface Fake {
  readonly deps: UploadDeps;
  readonly requests: UploadRequest[];
  readonly paused: string[];
  readonly resumed: string[];
}

function fake(): Fake {
  const requests: UploadRequest[] = [];
  const paused: string[] = [];
  const resumed: string[] = [];
  const start = (request: UploadRequest): UploadHandle => {
    requests.push(request);
    const id = `u${String(requests.length)}`;
    return {
      id,
      outcome: new Promise(() => undefined),
      pause: (): Promise<void> => {
        paused.push(id);
        return Promise.resolve();
      },
      resume: (): void => {
        resumed.push(id);
      },
      cancel: () => Promise.resolve(),
    };
  };
  return {
    deps: { resolve: () => Promise.resolve({ folderId: FOLDER, path: 'Uploads/Alex' }), start },
    requests,
    paused,
    resumed,
  };
}

describe('library uploads', () => {
  beforeEach(() => {
    uploadPath.set(null);
  });

  it('sends every file to the person’s Uploads folder through the resumable client', async () => {
    const { deps, requests } = fake();
    await expect(uploadFiles([picked('a.jpg', 3), picked('b.mov', 5)], deps)).resolves.toBe(2);
    expect(uploadPath.get()).toBe('Uploads/Alex');
    expect(requests.map((request) => request.target)).toEqual([
      { kind: 'folder', folderId: FOLDER },
      { kind: 'folder', folderId: FOLDER },
    ]);
    expect(requests.map((request) => request.name)).toEqual(['a.jpg', 'b.mov']);
    expect(requests[1]?.source.size).toBe(5);
    expect(requests[0]?.identity).toBe(identityOf(picked('a.jpg', 3)));
  });

  it('asks the hub for nothing when no file was picked', async () => {
    const resolve = vi.fn(() => Promise.resolve({ folderId: FOLDER, path: 'Uploads/Alex' }));
    await expect(uploadFiles([], { ...fake().deps, resolve })).resolves.toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('pauses and resumes the uploads still running', async () => {
    const { deps, paused, resumed } = fake();
    await uploadFiles([picked('c.jpg', 1)], deps);
    pauseUploads();
    resumeUploads();
    expect(paused).toContain('u1');
    expect(resumed).toContain('u1');
  });
});
