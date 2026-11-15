import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveReadService } from '../../../src/drive/service-read';
import { PhotoMedia } from '../../../src/photos/media-routes';
import { ffmpegPath } from '../../../src/media/ffmpeg-path';
import { playableCopyPath } from '../../../src/photos/pipeline/playable';
import { makeRig, type Answer, type Rig } from './rig';

const run = promisify(execFile);

let rig: Rig;

const ANSWER: Answer = { caption: 'A clip.', scene: 'street', labels: ['car'], pets: [] };

beforeEach(async () => {
  rig = await makeRig();
});

afterEach(async () => {
  await rig.close();
});

async function clip(relPath: string): Promise<string> {
  const target = join(rig.opened.directory, relPath);
  await mkdir(dirname(target), { recursive: true });
  await run(ffmpegPath(), [
    ...['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=5'],
    ...['-pix_fmt', 'yuv420p', target],
  ]);
  return target;
}

function visionBody(): string {
  const call = rig.sent.find((entry) => entry.path.endsWith('/chat/completions'));
  return JSON.stringify(call?.body);
}

describe('videos', () => {
  it('waits for the playable result, then sends the original when no copy was made', async () => {
    await clip('Photos/clip.mp4');
    rig.answers.set('*', ANSWER);
    const id = await rig.photo({
      n: 1,
      root: rig.homeRoot,
      kind: 'video',
      relPath: 'Photos/clip.mp4',
    });
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
    rig.opened.store.database
      .prepare("update drive_media set playable_state = 'ready' where item_id = ?")
      .run(id);
    rig.opened.store.feed.notice({
      type: 'drive_changed',
      rootIds: [rig.homeRoot],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    });
    await rig.settle();
    expect(visionBody()).toContain('video_url');
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('done');
  });

  it('sends the smaller playable copy when there is one', async () => {
    await clip('Photos/clip.mp4');
    rig.answers.set('*', ANSWER);
    const id = await rig.photo({
      n: 1,
      root: rig.homeRoot,
      kind: 'video',
      relPath: 'Photos/clip.mp4',
    });
    const copy = playableCopyPath(rig.opened.layout, id, 1, 'fullHd');
    await mkdir(dirname(copy), { recursive: true });
    await writeFile(copy, 'copy-bytes');
    rig.opened.store.database
      .prepare("update drive_media set playable_state = 'ready' where item_id = ?")
      .run(id);
    rig.ai.start();
    await rig.settle();
    expect(visionBody()).toContain(Buffer.from('copy-bytes').toString('base64'));
  });

  it('keeps one distinct face per person from the poster and the scene frames', async () => {
    await clip('Photos/clip.mp4');
    rig.answers.set('*', ANSWER);
    rig.faces.current = [
      {
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
          { x: 0.25, y: 0.25 },
          { x: 0.2, y: 0.3 },
          { x: 0.3, y: 0.3 },
        ],
        score: 0.9,
        quality: 0.8,
        embedding: new Float32Array(128).fill(0.1),
      },
    ];
    const id = await rig.photo({
      n: 1,
      root: rig.homeRoot,
      kind: 'video',
      relPath: 'Photos/clip.mp4',
    });
    rig.ai.start();
    await rig.settle();
    expect(rig.opened.store.photoFaces.forItem(id)).toHaveLength(1);
  });
});

describe('Photos preferences that cannot be read', () => {
  it('treats the person as having switched everything off and sends nothing', async () => {
    await rig.photo({ n: 1, root: rig.memberRoot, answer: ANSWER });
    rig.opened.store.database
      .prepare(
        `insert into layouts (client_id, profile_id, page, layout, updated_at)
          values (null, ?, 'photos', '{"version": 99}', ?)`,
      )
      .run(rig.member, '2026-11-14T00:00:00.000Z');
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
    expect(rig.ai.statusOf({ profileId: rig.member })).toMatchObject({
      smartSearch: false,
      faceGrouping: false,
    });
    expect(() => rig.ai.setSwitches({ profileId: rig.member }, { smartSearch: true })).toThrow(
      /cannot be read/u,
    );
  });
});

describe('model settings', () => {
  it('starts from the defaults, merges changes and refuses stored garbage', () => {
    expect(rig.ai.models.read().vision).toBe('google/gemini-3.1-flash-lite');
    expect(rig.ai.models.update({ eraser: 'x/y' })).toMatchObject({
      eraser: 'x/y',
      vision: 'google/gemini-3.1-flash-lite',
    });
    rig.opened.store.settingsKv.save('photos_ai', { vision: 4 });
    expect(() => rig.ai.models.read()).toThrow(/cannot be read/u);
  });
});

describe('faces idle', () => {
  it('tells listeners which person had faces detected once the face queue drains', async () => {
    rig.faces.current = [
      {
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
          { x: 0.25, y: 0.25 },
          { x: 0.2, y: 0.3 },
          { x: 0.3, y: 0.3 },
        ],
        score: 0.9,
        quality: 0.8,
        embedding: new Float32Array(128).fill(0.1),
      },
    ];
    const idle: string[] = [];
    const stop = rig.ai.onFacesIdle((profileId) => idle.push(profileId));
    await rig.photo({ n: 1, root: rig.memberRoot });
    await rig.photo({ n: 2, root: rig.homeRoot, colour: '#334455' });
    rig.ai.start();
    await rig.settle();
    stop();
    expect(idle.toSorted()).toEqual([rig.owner, rig.member].toSorted());
  });
});

describe('the media job list', () => {
  it('leaves the Photos AI jobs out of media processing and media info', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot });
    rig.ai.start();
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('failed');
    const media = new PhotoMedia(
      rig.opened.store.context,
      new DriveReadService(rig.opened.store),
      rig.opened.store,
    );
    const actor = { profileId: rig.owner };
    expect(media.processing(actor)).toEqual({ queued: 0, running: 0, failed: [] });
    expect(media.info(actor, id)).toMatchObject({ itemId: id, preview: { state: 'ready' } });
  });
});
