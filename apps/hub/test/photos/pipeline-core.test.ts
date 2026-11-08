import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { thumbHashToAverageRGBA } from 'thumbhash';
import {
  DERIVED_CACHE_CONTROL,
  DERIVED_SIZE,
  derivedPath,
  pruneDerived,
  writeDerived,
} from '../../src/photos/pipeline/derived-paths';
import {
  MediaJobRunner,
  type JobHandler,
  type PipelineProgress,
} from '../../src/photos/pipeline/jobs';
import {
  PreviewDecoders,
  PreviewHandler,
  SHARP_DECODER,
  renderDerived,
  type PreviewDecoder,
} from '../../src/photos/pipeline/preview';
import { thumbHashOf } from '../../src/photos/pipeline/thumbhash';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import {
  DriveMediaJobsRepository,
  type DriveMediaJob,
} from '../../src/store/repositories/drive-media-jobs';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-000000000001';

type Fields = Record<string, string | number | Uint8Array | null>;

let database: DatabaseSync;
let context: StoreContext;
let items: DriveItemsRepository;
let media: DriveMediaRepository;
let jobs: DriveMediaJobsRepository;
let directory: string;
let layout: HubLayout;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function seedItem(n: number, fields: Fields = {}, withMedia = true): string {
  const id = itemId(n);
  insert('drive_items', {
    id,
    root_id: ROOT,
    rel_path: `${String(n)}.jpg`,
    name: `${String(n)}.jpg`,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
    rev: 1,
    etag: `etag-${String(n)}`,
    outside: 0,
    thumb_state: 'none',
    ...fields,
  });
  if (withMedia) {
    insert('drive_media', {
      item_id: id,
      time_source: 'metadata',
      preview_state: 'none',
      poster_state: 'none',
      playable_state: 'none',
    });
  }
  return id;
}

const THUMB_ROW = z.object({ state: z.string(), reason: z.string().nullable() });

function thumbOf(id: string): { state: string; reason: string | null } {
  const row = database
    .prepare('select thumb_state as state, thumb_reason as reason from drive_items where id = ?')
    .get(id);
  return THUMB_ROW.parse(row);
}

function writeThumb(id: string, thumb: { state: string; reason?: string }): void {
  database
    .prepare('update drive_items set thumb_state = ?, thumb_reason = ? where id = ?')
    .run(thumb.state, thumb.reason ?? null, id);
}

beforeEach(async () => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  items = new DriveItemsRepository(context);
  media = new DriveMediaRepository(context);
  jobs = new DriveMediaJobsRepository(context);
  insert('drive_roots', {
    id: ROOT,
    kind: 'folder',
    label: 'Root',
    scope: 'home',
    owner_profile_id: null,
    path: '/srv/root',
    read_only: 0,
    versions: 1,
    synced: 0,
    index_id: 'index-1',
    state: 'ready',
    items: 0,
    folders: 0,
    bytes: 0,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    in_photos: 1,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  directory = await mkdtemp(join(tmpdir(), 'pipeline-core-'));
  layout = hubLayout(directory, {});
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('derived paths', () => {
  it('keeps each item in its derived cache folder and carries the revision and size', () => {
    const id = itemId(7);
    const data = hubLayout('/data', {});

    expect(derivedPath(data, { itemId: id, rev: 4, size: 'thumb' })).toBe(
      join(data.cache.derived(id), `${id}-4-thumb.webp`),
    );
    expect(DERIVED_CACHE_CONTROL).toContain('immutable');
  });

  it('refuses ids and sizes that could leave the derived folder', () => {
    expect(() =>
      derivedPath(hubLayout('/data', {}), { itemId: '../x', rev: 1, size: 'thumb' }),
    ).toThrow();
    expect(DERIVED_SIZE.safeParse('../thumb').success).toBe(false);
  });

  it('writes whole files and prunes the other revisions of one item only', async () => {
    const id = itemId(1);
    const other = itemId(2);
    await writeDerived(layout, { itemId: id, rev: 1, size: 'preview' }, Buffer.from('a'));
    await writeDerived(layout, { itemId: id, rev: 2, size: 'preview' }, Buffer.from('b'));
    await writeDerived(layout, { itemId: other, rev: 1, size: 'preview' }, Buffer.from('c'));

    expect(await pruneDerived(layout, id, 2)).toBe(1);

    await expect(
      stat(derivedPath(layout, { itemId: id, rev: 1, size: 'preview' })),
    ).rejects.toThrow();
    await expect(
      stat(derivedPath(layout, { itemId: id, rev: 2, size: 'preview' })),
    ).resolves.toBeDefined();
    await expect(
      stat(derivedPath(layout, { itemId: other, rev: 1, size: 'preview' })),
    ).resolves.toBeDefined();
    const names = await readdir(layout.cache.derived(id));
    expect(names.filter((name) => name.endsWith('.partial'))).toEqual([]);
  });

  it('prunes nothing when the item has no derived files', async () => {
    expect(await pruneDerived(layout, itemId(9), 1)).toBe(0);
  });
});

async function photo(width: number, height: number, orientation?: number): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  });
  return (orientation === undefined ? base : base.withMetadata({ orientation })).jpeg().toBuffer();
}

describe('render', () => {
  it('fits a large photo to 2048 and a 360 thumb without enlarging small ones', async () => {
    const path = join(directory, 'big.jpg');
    await writeFile(path, await photo(4000, 3000));
    const big = await renderDerived({ kind: 'encoded', path });
    const small = await renderDerived({
      kind: 'pixels',
      data: new Uint8Array(100 * 50 * 4).fill(255),
      width: 100,
      height: 50,
    });

    expect([big.width, big.height]).toEqual([2048, 1536]);
    expect(await sharp(big.thumb).metadata()).toMatchObject({
      width: 360,
      height: 270,
      format: 'webp',
    });
    expect([small.width, small.height]).toEqual([100, 50]);
    expect(await sharp(small.thumb).metadata()).toMatchObject({ width: 100, height: 50 });
  });

  it('applies the orientation of the file before sizing', async () => {
    const path = join(directory, 'rotated.jpg');
    await writeFile(path, await photo(600, 400, 6));

    const rendered = await renderDerived({ kind: 'encoded', path });

    expect([rendered.width, rendered.height]).toEqual([400, 600]);
  });

  it('derives the placeholder from the preview colours', async () => {
    const path = join(directory, 'red.jpg');
    await writeFile(path, await photo(300, 200));

    const rendered = await renderDerived({ kind: 'encoded', path });
    const average = thumbHashToAverageRGBA(rendered.thumbhash);

    expect(average.r * 255).toBeGreaterThan(150);
    expect(average.g * 255).toBeLessThan(90);
    expect(await thumbHashOf(rendered.preview)).toEqual(rendered.thumbhash);
  });
});

function job(kind: DriveMediaJob['kind'], itemNumber: number, visible = false): DriveMediaJob {
  return jobs.enqueue({ kind, itemId: seedItem(itemNumber), rev: 1, visible });
}

interface Gate {
  readonly started: string[];
  readonly release: () => void;
  readonly handler: JobHandler;
}

function gated(resource: 'cpu' | 'io', failing: ReadonlySet<string> = new Set()): Gate {
  const started: string[] = [];
  const waiting: (() => void)[] = [];
  const handler: JobHandler = {
    resource,
    run: async (current) => {
      started.push(current.item_id);
      await new Promise<void>((resolve) => waiting.push(resolve));
      if (failing.has(current.item_id)) throw new Error('cannot decode');
    },
    fail: () => undefined,
  };
  return {
    started,
    handler,
    release: (): void => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

function runnerOf(
  limits: { cpu: number; io: number },
  progress: PipelineProgress[] = [],
): MediaJobRunner {
  return new MediaJobRunner({
    jobs,
    limits,
    progress: (entry) => progress.push(entry),
    log: testLogger(),
  });
}

describe('job runner', () => {
  it('starts visible requests before older queued work', async () => {
    const gate = gated('cpu');
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', gate.handler);
    const first = job('preview', 1);
    const background = job('preview', 2);
    const visible = job('preview', 3, true);
    runner.start();
    await Promise.resolve();

    expect(gate.started).toEqual([visible.item_id]);
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await runner.idle();

    expect(gate.started[0]).toBe(visible.item_id);
    expect(gate.started.slice(1).sort()).toEqual([first.item_id, background.item_id].sort());
  });

  it('turns a queued job visible when the item is requested', async () => {
    const gate = gated('cpu');
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', gate.handler);
    runner.start();
    const early = runner.request({ kind: 'preview', itemId: seedItem(1), rev: 1 });
    const queued = runner.request({ kind: 'preview', itemId: seedItem(2), rev: 1 });
    const urgent = runner.request({ kind: 'preview', itemId: seedItem(3), rev: 1 });
    runner.prioritise(urgent.item_id);
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await runner.idle();

    expect(gate.started.slice(0, 2)).toEqual([early.item_id, urgent.item_id]);
    expect(gate.started).toContain(queued.item_id);
  });

  it('bounds each resource on its own', async () => {
    const cpu = gated('cpu');
    const io = gated('io');
    const runner = runnerOf({ cpu: 2, io: 1 });
    runner.register('preview', cpu.handler);
    runner.register('poster', io.handler);
    for (const n of [1, 2, 3]) job('preview', n);
    for (const n of [4, 5]) job('poster', n);
    runner.start();
    await Promise.resolve();

    expect(cpu.started).toHaveLength(2);
    expect(io.started).toHaveLength(1);
    cpu.release();
    io.release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(cpu.started).toHaveLength(3);
    expect(io.started).toHaveLength(2);
    cpu.release();
    io.release();
    await runner.idle();
  });

  it('records a failure with its reason and keeps going', async () => {
    const failing = seedItem(1);
    const gate = gated('cpu', new Set([failing]));
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', gate.handler);
    runner.request({ kind: 'preview', itemId: failing, rev: 1 });
    const fine = runner.request({ kind: 'preview', itemId: seedItem(2), rev: 1 });
    runner.start();
    await Promise.resolve();
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await runner.idle();

    expect(jobs.failures().map((entry) => [entry.item_id, entry.error])).toEqual([
      [failing, 'cannot decode'],
    ]);
    expect(jobs.byId(fine.id).state).toBe('done');
  });

  it('reports progress per kind and starts a new count when the work drains', async () => {
    const gate = gated('cpu');
    const progress: PipelineProgress[] = [];
    const runner = runnerOf({ cpu: 1, io: 1 }, progress);
    runner.register('preview', gate.handler);
    runner.start();
    runner.request({ kind: 'preview', itemId: seedItem(1), rev: 1 });
    runner.request({ kind: 'preview', itemId: seedItem(2), rev: 1 });
    gate.release();
    await new Promise((resolve) => setImmediate(resolve));
    gate.release();
    await runner.idle();
    runner.request({ kind: 'preview', itemId: seedItem(3), rev: 1 });
    gate.release();
    await runner.idle();

    expect(
      progress.map((entry) => `${entry.kind} ${String(entry.done)}/${String(entry.total)}`),
    ).toEqual([
      'preview 0/1',
      'preview 0/2',
      'preview 1/2',
      'preview 2/2',
      'preview 0/1',
      'preview 1/1',
    ]);
  });

  it('queues interrupted jobs again at start and drops jobs of older revisions', async () => {
    const gate = gated('cpu');
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', gate.handler);
    const interrupted = job('preview', 1);
    jobs.claim(['preview']);
    expect(jobs.byId(interrupted.id).state).toBe('running');
    runner.start();
    await Promise.resolve();

    expect(gate.started).toEqual([interrupted.item_id]);
    gate.release();
    await runner.idle();

    database.prepare('update drive_items set rev = 2 where id = ?').run(interrupted.item_id);
    const changed = items.byId(interrupted.item_id);
    runner.itemChanged(changed);

    expect(jobs.forItem(interrupted.item_id)).toEqual([]);
  });

  it('rejects two handlers for one kind', () => {
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', gated('cpu').handler);

    expect(() => {
      runner.register('preview', gated('cpu').handler);
    }).toThrow(/already registered/u);
  });
});

function handlerWith(decoders: PreviewDecoders, writer = writeThumb): PreviewHandler {
  return new PreviewHandler({
    store: { write: (work) => context.write(work), driveItems: items, driveMedia: media },
    writeThumb: writer,
    decoders,
    locate: (item) => Promise.resolve(join(directory, item.name)),
    layout,
    log: testLogger(),
  });
}

function sharpDecoders(): PreviewDecoders {
  const decoders = new PreviewDecoders();
  decoders.register(SHARP_DECODER);
  return decoders;
}

async function pending(n: number, rev = 1): Promise<DriveMediaJob> {
  const id = seedItem(n, { rev });
  await writeFile(join(directory, `${String(n)}.jpg`), await photo(900, 600));
  return jobs.enqueue({ kind: 'preview', itemId: id, rev });
}

describe('preview handler', () => {
  it('writes the derived files, the placeholder and both states together', async () => {
    const queued = await pending(1);

    await handlerWith(sharpDecoders()).run(queued, new AbortController().signal);

    expect(thumbOf(queued.item_id)).toEqual({ state: 'ready', reason: null });
    const row = media.byId(queued.item_id);
    expect(row.preview_state).toBe('ready');
    expect(row.thumbhash?.length).toBeGreaterThan(0);
    const preview = await sharp(
      derivedPath(layout, { itemId: queued.item_id, rev: 1, size: 'preview' }),
    ).metadata();
    const thumb = await sharp(
      derivedPath(layout, { itemId: queued.item_id, rev: 1, size: 'thumb' }),
    ).metadata();
    expect([preview.width, thumb.width, thumb.format]).toEqual([900, 360, 'webp']);
  });

  it('leaves both states untouched when the second write fails', async () => {
    const queued = await pending(1);
    const handler = handlerWith(sharpDecoders(), (id, thumb) => {
      writeThumb(id, thumb);
      throw new Error('disk full');
    });

    await expect(handler.run(queued, new AbortController().signal)).rejects.toThrow('disk full');

    expect(thumbOf(queued.item_id).state).toBe('none');
    expect(media.byId(queued.item_id).preview_state).toBe('none');
  });

  it('records unsupported with the decoder reason in both places', async () => {
    const queued = await pending(1);
    const decoders = new PreviewDecoders();
    const refusing: PreviewDecoder = {
      id: 'refusing',
      accepts: () => true,
      decode: () => Promise.resolve({ kind: 'unsupported', reason: 'the image is encrypted' }),
    };
    decoders.register(refusing);

    await handlerWith(decoders).run(queued, new AbortController().signal);

    expect(thumbOf(queued.item_id)).toEqual({
      state: 'unsupported',
      reason: 'the image is encrypted',
    });
    expect(media.byId(queued.item_id)).toMatchObject({
      preview_state: 'unsupported',
      preview_reason: 'the image is encrypted',
    });
  });

  it('records unsupported when no decoder reads the type', async () => {
    const queued = await pending(1);

    await handlerWith(new PreviewDecoders()).run(queued, new AbortController().signal);

    expect(thumbOf(queued.item_id).reason).toBe('no decoder reads image/jpeg');
  });

  it('records a failure from the runner with the error text in both places', async () => {
    const queued = await pending(1);

    handlerWith(sharpDecoders()).fail(queued, new Error('Input file is missing'));

    expect(thumbOf(queued.item_id)).toEqual({ state: 'failed', reason: 'Input file is missing' });
    expect(media.byId(queued.item_id).preview_reason).toBe('Input file is missing');
  });

  it('records a damaged file as a failure through the runner', async () => {
    const queued = await pending(1);
    await writeFile(join(directory, '1.jpg'), 'not an image');
    const handler = handlerWith(sharpDecoders());
    const runner = runnerOf({ cpu: 1, io: 1 });
    runner.register('preview', handler);
    runner.start();
    runner.request({ kind: 'preview', itemId: queued.item_id, rev: 1 });
    await runner.idle();

    expect(jobs.failures()).toHaveLength(1);
    expect(thumbOf(queued.item_id).state).toBe('failed');
    expect(media.byId(queued.item_id).preview_state).toBe('failed');
  });

  it('skips a job whose item changed revision or has no media record yet', async () => {
    const queued = await pending(1);
    database.prepare('update drive_items set rev = 2 where id = ?').run(queued.item_id);
    const noMedia = jobs.enqueue({ kind: 'preview', itemId: seedItem(2, {}, false), rev: 1 });

    await handlerWith(sharpDecoders()).run(queued, new AbortController().signal);
    await handlerWith(sharpDecoders()).run(noMedia, new AbortController().signal);

    expect(thumbOf(queued.item_id).state).toBe('none');
    expect(thumbOf(noMedia.item_id).state).toBe('none');
    await expect(
      stat(derivedPath(layout, { itemId: queued.item_id, rev: 1, size: 'preview' })),
    ).rejects.toThrow();
  });

  it('prunes the files of the older revision once the new one is ready', async () => {
    const first = await pending(1);
    const handler = handlerWith(sharpDecoders());
    await handler.run(first, new AbortController().signal);
    database.prepare('update drive_items set rev = 2 where id = ?').run(first.item_id);
    const second = jobs.enqueue({ kind: 'preview', itemId: first.item_id, rev: 2 });

    await handler.run(second, new AbortController().signal);

    const names = await readdir(layout.cache.derived(first.item_id));
    expect(names.sort()).toEqual([
      `${first.item_id}-2-preview.webp`,
      `${first.item_id}-2-thumb.webp`,
    ]);
  });
});
