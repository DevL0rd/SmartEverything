import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import mediaInfoFactory from 'mediainfo.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const RESULT = z.object({
  media: z.object({ track: z.array(z.record(z.string(), z.unknown())) }),
});

async function analyse(name: string): Promise<z.infer<typeof RESULT>['media']['track']> {
  const bytes = readFileSync(repositoryFile(`apps/hub/test/fixtures/drive-media/${name}`));
  const probe = await mediaInfoFactory({ format: 'object' });
  try {
    const result = await probe.analyzeData(bytes.length, (length, offset) =>
      bytes.subarray(offset, offset + length),
    );
    return RESULT.parse(result).media.track;
  } finally {
    probe.close();
  }
}

const general = (tracks: readonly Record<string, unknown>[]): Record<string, unknown> | undefined =>
  tracks.find((track) => track['@type'] === 'General');

describe('mediainfo.js contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'mediainfo.js')).toBe(installedVersion('mediainfo.js'));
  });

  it('ships the wasm module at the path the hub resolves', () => {
    const path = createRequire(repositoryFile('apps/hub/package.json')).resolve(
      'mediainfo.js/MediaInfoModule.wasm',
    );
    expect(existsSync(path)).toBe(true);
  });

  it('reports an MP4 with its duration in seconds, UTC creation time, location and size', async () => {
    const tracks = await analyse('clip-gps.mp4');
    expect(general(tracks)).toMatchObject({
      Duration: 1,
      Encoded_Date: '2025-06-14 02:30:15 UTC',
      Recorded_Location: '13.7563°N 100.5018°E 12.000m',
      IsStreamable: 'Yes',
    });
    expect(tracks.find((track) => track['@type'] === 'Video')).toMatchObject({
      Width: 96,
      Height: 64,
      Rotation: '0.000',
    });
  });

  it('reports the recorded date of a MOV with its offset', async () => {
    expect(general(await analyse('live-photo.mov'))).toMatchObject({
      Recorded_Date: '2025-06-14 09:30:15+07:00',
      IsStreamable: 'No',
    });
  });

  it('reports a date only tag of an audio file as given', async () => {
    expect(general(await analyse('tone.mp3'))).toMatchObject({
      Recorded_Date: '2019-03-04',
      Duration: 2.037,
    });
  });

  it('answers a file it cannot identify with a General track only', async () => {
    const probe = await mediaInfoFactory({ format: 'object' });
    try {
      const bytes = Buffer.from('x'.repeat(40));
      const tracks = RESULT.parse(
        await probe.analyzeData(bytes.length, (length, offset) =>
          bytes.subarray(offset, offset + length),
        ),
      ).media.track;
      expect(tracks.map((track) => track['@type'])).toEqual(['General']);
    } finally {
      probe.close();
    }
  });
});
