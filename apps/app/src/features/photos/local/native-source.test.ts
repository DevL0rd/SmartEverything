import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeSource } from './native-source';

const permission = vi.hoisted(() => ({ access: vi.fn(), request: vi.fn(), picker: vi.fn() }));
vi.mock('../backup/runner/media-library', (): object => ({
  MEDIA_PAGE_ROWS: 500,
  mediaScanCancelled: (signal?: AbortSignal) => signal?.aborted === true,
  mediaLibraryPort: {
    access: permission.access,
    requestAccess: permission.request,
    presentPicker: permission.picker,
    onChange: (): (() => void) => () => undefined,
  },
}));

beforeEach(() => {
  permission.access.mockReset();
  permission.request.mockReset();
  permission.picker.mockReset();
});

describe('Android local photo access', () => {
  it('requests only media access for browsing without a backup operation', async () => {
    permission.access.mockResolvedValue('none');
    permission.request.mockResolvedValue('all');
    expect(await nativeSource.requestAccess()).toBe('all');
    expect(permission.request).toHaveBeenCalledOnce();
    expect(permission.picker).not.toHaveBeenCalled();
  });

  it('lets limited-access users change selected photos through the OS picker', async () => {
    permission.access.mockResolvedValueOnce('limited').mockResolvedValueOnce('all');
    permission.picker.mockResolvedValue(undefined);
    expect(await nativeSource.requestAccess()).toBe('all');
    expect(permission.picker).toHaveBeenCalledOnce();
    expect(permission.request).not.toHaveBeenCalled();
  });
});
