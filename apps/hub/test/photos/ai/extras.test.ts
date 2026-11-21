import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhotoMedia } from '../../../src/photos/media-routes';
import { ffmpegPath } from '../../../src/media/ffmpeg-path';
import { playableCopyPath } from '../../../src/photos/pipeline/playable';
import { FACE_MODEL_ID } from '../../../src/photos/ai/defaults';
import { PhotoAiQueue } from '../../../src/photos/ai/queue';
import { float32Bytes } from '../../../src/photos/ai/vectors';
import { startPeople } from '../../../src/photos/people/wiring';
import { DriveMediaJobsRepository } from '../../../src/store/repositories/drive-media-jobs';
import type { PhotoFaceRow } from '../../../src/store/repositories/photo-faces';
import { makeRig, type Answer, type Rig } from './rig';

const run = promisify(execFile);

let rig: Rig;

const ANSWER: Answer = { caption: 'A clip.', scene: 'street', labels: ['car'], text: '', pets: [] };

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
      cursor: rig.opened.store.driveFeed.latestSeq(),
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
    expect(await rig.ai.statusOf({ profileId: rig.member })).toMatchObject({
      smartSearch: false,
      faceGrouping: false,
    });
    await expect(
      rig.ai.setSwitches({ profileId: rig.member }, { smartSearch: true }),
    ).rejects.toThrow(/cannot be read/u);
  });
});

describe('model settings', () => {
  it('starts from the defaults, merges changes and refuses stored garbage', async () => {
    expect((await rig.ai.models()).vision).toBe('qwen/qwen3.6-35b-a3b');
    expect(await rig.ai.updateModels({ eraser: 'x/y' })).toMatchObject({
      eraser: 'x/y',
      vision: 'qwen/qwen3.6-35b-a3b',
    });
    rig.opened.store.settingsKv.save('photos_ai', { vision: 4 });
    await expect(rig.ai.models()).rejects.toThrow(/cannot be read/u);
  });
});

const FACE = {
  box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
  landmarks: [
    { x: 0.2, y: 0.2 },
    { x: 0.3, y: 0.2 },
    { x: 0.25, y: 0.25 },
    { x: 0.2, y: 0.3 },
    { x: 0.3, y: 0.3 },
  ] as const,
  score: 0.9,
  quality: 0.8,
  embedding: new Float32Array(128).fill(0.1),
};

function storedFace(itemId: string): PhotoFaceRow {
  return {
    id: randomUUID(),
    itemId,
    rev: 1,
    kind: 'person',
    species: null,
    box: FACE.box,
    landmarks: FACE.landmarks,
    score: FACE.score,
    quality: FACE.quality,
    model: FACE_MODEL_ID,
    vector: float32Bytes(FACE.embedding),
  };
}

describe('faces idle', () => {
  it('drains from the stored queue even when a requested face job left it unrun', async () => {
    const first = await rig.photo({ n: 1, root: rig.homeRoot });
    const second = await rig.photo({ n: 2, root: rig.homeRoot, colour: '#334455' });
    const jobs = new DriveMediaJobsRepository(rig.opened.store.context);
    const queue = new PhotoAiQueue(
      rig.opened.store.host,
      { adopt: (): void => undefined },
      () => undefined,
    );
    const drained: string[] = [];
    queue.onDrained((stage) => drained.push(stage));
    await queue.request([
      { kind: 'faces', itemId: first, rev: 1, modelVersion: 'sface' },
      { kind: 'faces', itemId: second, rev: 1, modelVersion: 'sface' },
    ]);
    rig.opened.store.database
      .prepare("delete from drive_media_jobs where item_id = ? and kind = 'faces'")
      .run(first);
    const [job] = jobs.claim(['faces'], 1);
    if (job === undefined) throw new Error('the second face job was not queued');
    const tracked = queue.tracked({
      resource: 'image',
      run: () => Promise.resolve(),
      fail: () => Promise.resolve(),
    });
    await tracked.run(job, new AbortController().signal);
    jobs.complete(job.id);
    await tracked.settled?.(job);
    expect(drained).toEqual(['faces']);
  });

  it('groups the faces stored before the hub started and counts them in the status', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot });
    rig.opened.store.photoFaces.replaceKindForItem(id, 'person', [storedFace(id)]);
    const notices: unknown[] = [];
    const stop = rig.opened.store.feed.subscribeNotices((notice) => notices.push(notice));
    expect((await rig.ai.statusOf({ profileId: rig.owner })).people).toEqual({
      faces: 1,
      grouped: 0,
    });
    await startPeople({ store: rig.opened.store, ai: rig.ai, timeZone: () => 'UTC' }).drained();
    await rig.settle();
    stop();
    expect(rig.opened.store.photoGroups.forProfile(rig.owner, 'person')).toHaveLength(1);
    expect((await rig.ai.statusOf({ profileId: rig.owner })).people).toEqual({
      faces: 1,
      grouped: 1,
    });
    expect(notices).toContainEqual({ type: 'photos_people_changed', profileId: rig.owner });
  });

  it('tells listeners which person had faces detected once the face queue drains', async () => {
    rig.faces.current = [FACE];
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
    const media = new PhotoMedia(rig.opened.store.host);
    const actor = { profileId: rig.owner };
    expect(await media.processing(actor)).toEqual({ queued: 0, running: 0, failed: [] });
    expect(await media.info(actor, id)).toMatchObject({ itemId: id, preview: { state: 'ready' } });
  });
});
