import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import { NOTICES, pausedProbes } from '../../../test-support/paused-probe';
import { ScanUploads, useScanUpload } from './scan-upload';

const { mount, pausedScreen, resume } = pausedProbes();

function unreadable(name: string): PickedBlob {
  return {
    name,
    mime: 'application/octet-stream',
    bytes: 4,
    preview: null,
    data: () => Promise.resolve(new ArrayBuffer(4)),
    blob: () => Promise.resolve(new Blob()),
  };
}

describe('scan uploads on a paused screen', () => {
  it('holds scan upload notices while paused and shows the latest state on resume', () => {
    const uploads = new ScanUploads(
      () => Promise.reject(new Error('the transport is not used for an unreadable file')),
      () => undefined,
    );
    const pause = pausedScreen();
    const probe = mount(pause, () => useScanUpload(uploads, 'map-1'));
    const mounted = probe.renders();
    for (let notice = 0; notice < NOTICES; notice += 1) {
      act(() => {
        if (notice % 2 === 0) uploads.start('map-1', unreadable(`scan-${String(notice)}.bin`));
        else uploads.dismiss('map-1');
      });
    }
    expect(probe.renders()).toBe(mounted);
    act(() => {
      uploads.start('map-1', unreadable('last.bin'));
    });
    resume(pause);
    expect(probe.renders()).toBe(mounted + 1);
    expect(probe.value()?.kind).toBe('failed');
  });
});
