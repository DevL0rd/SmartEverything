import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CameraOfflineError, CameraPrivacyError } from '../../../src/cameras/camera-service';
import { StoredPictures } from '../../../src/automations/effects/camera-pictures';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import { furnish, type Home } from '../world/support';

const FRAME = Uint8Array.from([1, 2, 3, 4]);

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

function pictures(snapshot: () => Promise<Uint8Array>): StoredPictures {
  return new StoredPictures({
    snapshot,
    recordings: home.test.store.cameras,
    recordingPath: (path) => join(home.test.directory, 'recordings', path),
    now: () => home.clock.current,
  });
}

describe('stored camera pictures', () => {
  it('saves a picture as a snapshot recording and loads it back', async () => {
    const shelf = pictures(() => Promise.resolve(FRAME));
    const taken = await shelf.take(home.sensor.id, 'full');
    const row = home.test.store.cameras.recording(taken.id);
    expect(row).toMatchObject({ device_id: home.sensor.id, kind: 'snapshot', bytes: 4 });
    expect(await shelf.load(taken.id)).toEqual({
      mimeType: 'image/jpeg',
      base64: Buffer.from(FRAME).toString('base64'),
    });
  });

  it('names a camera that is switched off for privacy as refused', async () => {
    const shelf = pictures(() => Promise.reject(new CameraPrivacyError(home.sensor.id)));
    await expect(shelf.take(home.sensor.id, 'full')).rejects.toMatchObject({ kind: 'Refused' });
  });

  it('names an offline camera as unreachable', async () => {
    const shelf = pictures(() => Promise.reject(new CameraOfflineError(home.sensor.id)));
    await expect(shelf.take(home.sensor.id, 'thumb')).rejects.toMatchObject({
      kind: 'Unreachable',
    });
  });

  it('stores nothing when the camera gave no picture', async () => {
    const shelf = pictures(() => Promise.reject(new CameraPrivacyError(home.sensor.id)));
    await shelf.take(home.sensor.id, 'full').catch(() => undefined);
    expect(
      home.test.store.cameras.recordings({
        deviceIds: [home.sensor.id],
        kind: 'snapshot',
        limit: 5,
      }),
    ).toEqual([]);
  });

  it('cannot load something that is not a saved picture', async () => {
    const shelf = pictures(() => Promise.resolve(FRAME));
    const error = await shelf.load('7c9e6679-7425-40de-944b-e07fc1f90ae7').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ kind: 'NotFound' });
  });
});
