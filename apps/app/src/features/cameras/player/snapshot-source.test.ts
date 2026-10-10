import { describe, expect, it } from 'vitest';
import { pictureSourceOf, snapshotNameOf } from './snapshot-source';

const MEDIA = { id: 'stream', source: null };

describe('where a snapshot comes from', () => {
  it('draws the frame from the video when the player shows peer-to-peer video it can read', () => {
    expect(pictureSourceOf('webrtc', MEDIA, true)).toStrictEqual({ kind: 'video', media: MEDIA });
  });

  it('asks the server for a frame on the relay, on Android and before the video starts', () => {
    expect(pictureSourceOf('mse', MEDIA, true)).toStrictEqual({ kind: 'server' });
    expect(pictureSourceOf('webrtc', MEDIA, false)).toStrictEqual({ kind: 'server' });
    expect(pictureSourceOf('webrtc', null, true)).toStrictEqual({ kind: 'server' });
  });

  it('names the picture after the camera and the moment, without colons', () => {
    expect(snapshotNameOf('Front door', new Date('2026-10-09T10:01:02.003Z'))).toBe(
      'Front door-2026-10-09T10-01-02.003Z',
    );
  });
});
