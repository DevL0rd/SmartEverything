import { createServer } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import { serveDriveDerived } from '../../src/server/drive-derived';
import { MediaLinks } from '../../src/server/media-links';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { recordItem } from '../../src/drive/changes';
import { fileEnv } from '../../src/drive/versions';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import { derivedPath } from '../../src/photos/pipeline/derived-paths';
import { PhotoPipeline } from '../../src/photos/pipeline/runtime';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { DriveMediaJobsRepository } from '../../src/store/repositories/drive-media-jobs';
import { testStore, type TestStore } from '../support/store';
import { testLogger } from '../support/logs';
import { insertDriveRow } from './photo-rows';

const ROOT = '0f000000-0000-4000-8000-000000000001';
const PHOTO = '0f000000-0000-4000-8000-000000000002';
const VIDEO = '0f000000-0000-4000-8000-000000000003';
const NOW = '2026-11-08T00:00:00.000Z';
let opened: TestStore;
let pipeline: PhotoPipeline;
let source: string;

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  source = opened.layout.home.drive;
  await mkdir(source, { recursive: true });
  insertDriveRow(opened.store.database, { id: ROOT, scope: 'home', ownerId: null });
  pipeline = new PhotoPipeline({
    store: opened.store,
    parts: { context: opened.store.context },
    layout: opened.layout,
    log: testLogger('photo-runtime'),
  });
});

afterEach(async () => {
  await pipeline.stop();
  await opened.close();
});

function thumbState(id: string): string {
  const item = opened.store.driveItems.byId(id, null);
  if (item.kind === 'folder') throw new Error('A folder has no thumbnail.');
  return item.thumb.state;
}

function seed(id: string, kind: 'image' | 'video', name: string, mime: string): void {
  opened.store.database
    .prepare(
      `insert into drive_items
    (id, root_id, rel_path, name, kind, mime, bytes, integrity, modified_at, added_at,
    rev, etag, outside, thumb_state, taken_at)
    values (?, ?, ?, ?, ?, ?, 10, 'ok', ?, ?, 1, 'phone-rev1', 0, 'none', ?)`,
    )
    .run(id, ROOT, name, name, kind, mime, NOW, NOW, NOW);
  opened.store.database
    .prepare(
      `insert into drive_media
    (item_id, time_source, preview_state, poster_state, playable_state)
    values (?, 'metadata', 'none', 'none', 'none')`,
    )
    .run(id);
}

it('catches up existing phone photos and processes newly indexed phone video without requeuing completed work', async () => {
  const image = await sharp({
    create: { width: 30, height: 20, channels: 3, background: '#ffbb22' },
  })
    .jpeg()
    .toBuffer();
  await writeFile(join(source, 'phone.jpg'), image);
  seed(PHOTO, 'image', 'phone.jpg', 'image/jpeg');
  pipeline.start();
  await pipeline.runner.idle();
  const media = new DriveMediaRepository(opened.store.context);
  expect(media.byId(PHOTO).preview_state).toBe('ready');
  expect(thumbState(PHOTO)).toBe('ready');
  expect(
    (
      await sharp(
        await readFile(derivedPath(opened.layout, { itemId: PHOTO, rev: 1, size: 'thumb' })),
      ).metadata()
    ).format,
  ).toBe('webp');
  await promisify(execFile)(ffmpegPath(), [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=32x24:d=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(source, 'phone.mp4'),
  ]);
  seed(VIDEO, 'video', 'phone.mp4', 'video/mp4');
  pipeline.reconcile();
  await pipeline.runner.idle();
  expect(media.byId(VIDEO)).toMatchObject({ poster_state: 'ready', playable_state: 'ready' });
  expect(thumbState(VIDEO)).toBe('ready');
  pipeline.reconcile();
  expect(new DriveMediaJobsRepository(opened.store.context).forItem(VIDEO)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'poster', attempts: 1 }),
      expect.objectContaining({ kind: 'playable', attempts: 1 }),
    ]),
  );
  expect(await readFile(join(source, 'phone.jpg'))).toEqual(image);
});

it('serves signed phone photo thumbnails and video range requests, rejecting unsigned requests', async () => {
  await writeFile(
    join(source, 'phone.jpg'),
    await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#aa22ff',
      },
    })
      .jpeg()
      .toBuffer(),
  );
  seed(PHOTO, 'image', 'phone.jpg', 'image/jpeg');
  await promisify(execFile)(ffmpegPath(), [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=32x24:d=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(source, 'phone.mp4'),
  ]);
  seed(VIDEO, 'video', 'phone.mp4', 'video/mp4');
  pipeline.start();
  await pipeline.runner.idle();
  const links = new MediaLinks(() => new Date(NOW));
  const deps = {
    store: opened.store,
    parts: { context: opened.store.context },
    layout: opened.layout,
    log: testLogger(),
    links,
    now: (): Date => new Date(NOW),
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture');
    const id = url.pathname.includes(PHOTO) ? PHOTO : VIDEO;
    const size = url.pathname.endsWith('/thumb') ? 'thumb' : 'playable';
    void serveDriveDerived(deps, pipeline, { request, response, url }, { itemId: id, size }).catch(
      (error: unknown) => {
        response.writeHead(error instanceof ApiError ? 401 : 500);
        response.end();
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No fixture port');
    const base = `http://127.0.0.1:${String(address.port)}`;
    const photo = await fetch(base + links.driveThumb(PHOTO, 'thumb', 1).url);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/webp');
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format).toBe('webp');
    const video = await fetch(base + links.driveThumb(VIDEO, 'playable', 1).url, {
      headers: { range: 'bytes=0-31' },
    });
    expect(video.status).toBe(206);
    expect(video.headers.get('content-type')).toBe('video/mp4');
    expect(video.headers.get('content-range')).toMatch(/^bytes 0-31\//u);
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(
      new Uint8Array((await readFile(join(source, 'phone.mp4'))).subarray(0, 32)),
    );
    const denied = await fetch(`${base}/media/drive/${PHOTO}/thumb`);
    expect(denied.status).toBe(401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      }),
    );
  }
});

it('rebuilds photo and video derivatives for renamed and replaced revisions through the Drive change feed', async () => {
  await writeFile(
    join(source, 'phone.jpg'),
    await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#aa22ff',
      },
    })
      .jpeg()
      .toBuffer(),
  );
  seed(PHOTO, 'image', 'phone.jpg', 'image/jpeg');
  const generateVideo = (name: string, colour: string): Promise<unknown> =>
    promisify(execFile)(ffmpegPath(), [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${colour}:s=32x24:d=1`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      join(source, name),
    ]);
  await generateVideo('phone.mp4', 'blue');
  seed(VIDEO, 'video', 'phone.mp4', 'video/mp4');
  pipeline.start();
  await pipeline.runner.idle();
  const env = {
    ...fileEnv(opened.store, testLogger(), () => new Date(NOW)),
    store: opened.store,
    purge: { rearm: (): void => undefined },
  };
  const media = new DriveMediaRepository(opened.store.context);
  const jobs = new DriveMediaJobsRepository(opened.store.context);
  for (const [id, name] of [
    [PHOTO, 'renamed.jpg'],
    [VIDEO, 'renamed.mp4'],
  ] as const) {
    const before = opened.store.driveItems.byId(id, null);
    await rename(join(source, before.name), join(source, name));
    const info = await stat(join(source, name));
    const write = (): void => {
      const item = opened.store.driveItems.byId(id, null);
      recordItem(env, {
        draft: {
          ...item,
          name,
          relPath: name,
          modifiedAt: new Date(Date.parse(NOW) + item.rev * 1000).toISOString(),
        },
        identity: { dev: String(info.dev), ino: String(info.ino) },
        op: 'update',
        actor: { actorProfileId: null, via: 'app', deviceId: null },
      });
    };
    write();
    await pipeline.runner.idle();
    const renamed = opened.store.driveItems.byId(id, null);
    expect(renamed.rev).toBeGreaterThan(before.rev);
    expect(
      (
        await sharp(
          await readFile(
            derivedPath(opened.layout, { itemId: id, rev: renamed.rev, size: 'thumb' }),
          ),
        ).metadata()
      ).format,
    ).toBe('webp');
    if (id === PHOTO)
      await writeFile(
        join(source, name),
        await sharp({
          create: {
            width: 28,
            height: 18,
            channels: 3,
            background: '#22aaff',
          },
        })
          .jpeg()
          .toBuffer(),
      );
    else await generateVideo(name, 'red');
    write();
    await pipeline.runner.idle();
    const replaced = opened.store.driveItems.byId(id, null);
    expect(replaced.rev).toBeGreaterThan(renamed.rev);
    expect(media.byId(id).preview_state).toBe('ready');
    expect(
      (
        await sharp(
          await readFile(
            derivedPath(opened.layout, { itemId: id, rev: replaced.rev, size: 'thumb' }),
          ),
        ).metadata()
      ).format,
    ).toBe('webp');
    expect(jobs.forItem(id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ rev: replaced.rev, state: 'done' })]),
    );
    if (id === VIDEO) expect(media.byId(id).playable_state).toBe('ready');
  }
});
