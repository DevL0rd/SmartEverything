import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import sharp from 'sharp';
import { z } from 'zod';
import { OpenRouterClient } from '../../../src/openrouter/client';
import { derivedPath, writeDerived } from '../../../src/photos/pipeline/derived-paths';
import { MediaJobRunner } from '../../../src/photos/pipeline/jobs';
import { PhotoAi, openRouterClients } from '../../../src/photos/ai/service';
import type { FaceDetector } from '../../../src/photos/ai/faces-job';
import { DriveMediaJobsRepository } from '../../../src/store/repositories/drive-media-jobs';
import type { DetectedFace } from '../../../src/vision/faces/engine';
import { testLogger } from '../../support/logs';
import { driveTestStore } from '../../drive/spaces-fixture';
import { insertDriveRow } from '../photo-rows';
import type { TestStore } from '../../support/store';

export const NOW = '2026-11-14T10:00:00.000Z';

export interface Answer {
  readonly caption: string;
  readonly scene: string;
  readonly labels: readonly string[];
  readonly pets: readonly { readonly species: string; readonly box: readonly number[] }[];
}

export interface Sent {
  readonly path: string;
  readonly body: Record<string, unknown>;
}

export interface Rig {
  readonly opened: TestStore;
  readonly ai: PhotoAi;
  readonly runner: MediaJobRunner;
  readonly owner: string;
  readonly member: string;
  readonly homeRoot: string;
  readonly memberRoot: string;
  readonly sent: Sent[];
  readonly answers: Map<string, Answer>;
  readonly keyState: { key: string | null; listeners: Set<() => void> };
  readonly faces: { current: DetectedFace[] };
  readonly photo: (options: PhotoOptions) => Promise<string>;
  readonly settle: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface PhotoOptions {
  readonly n: number;
  readonly root: string;
  readonly kind?: 'image' | 'video';
  readonly relPath?: string;
  readonly colour?: string;
  readonly answer?: Answer;
}

const VOCABULARY_SIZE = 512;

export function embeddingOf(text: string): number[] {
  const vector = new Array<number>(VOCABULARY_SIZE).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/gu) ?? []) {
    let hash = 7;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % VOCABULARY_SIZE;
    vector[hash] = (vector[hash] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function itemFields(
  id: string,
  rootId: string,
  opts: PhotoOptions,
): Record<string, string | number | null> {
  const relPath = opts.relPath ?? `Photos/${String(opts.n)}.jpg`;
  const video = opts.kind === 'video';
  return {
    id,
    root_id: rootId,
    rel_path: relPath,
    name: relPath.slice(relPath.lastIndexOf('/') + 1),
    kind: video ? 'video' : 'image',
    mime: video ? 'video/mp4' : 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${id}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: '2026-03-04T10:00:00.000Z',
    width: 400,
    height: 300,
    duration_ms: video ? 1000 : null,
  };
}

function inodeFor(store: TestStore['store'], rootId: string): number | undefined {
  const columns = store.database
    .prepare("select name from pragma_table_info('drive_items')")
    .all()
    .map((row) => String(row['name']));
  if (!columns.includes('inode_id')) return undefined;
  const inode = store.database
    .prepare(
      `insert into drive_inodes (root_id, is_root, type, mode, atime_ns, mtime_ns, ctime_ns,
        btime_ns, orphan) values (?, 0, 'file', 420, 0, 0, 0, 0, 0)`,
    )
    .run(rootId);
  return Number(inode.lastInsertRowid);
}

function insertItem(
  store: TestStore['store'],
  id: string,
  rootId: string,
  opts: PhotoOptions,
): void {
  const inode = inodeFor(store, rootId);
  const fields = {
    ...itemFields(id, rootId, opts),
    ...(inode === undefined ? {} : { inode_id: inode }),
  };
  const names = Object.keys(fields);
  store.database
    .prepare(
      `insert into drive_items (${names.join(', ')}) values (${names.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
  const video = opts.kind === 'video';
  store.database
    .prepare(
      `insert into drive_media (item_id, time_source, preview_state, poster_state, playable_state)
        values (?, 'metadata', ?, ?, 'none')`,
    )
    .run(id, video ? 'none' : 'ready', video ? 'ready' : 'none');
  if (rootId === store.driveRoots.list().find((root) => root.scope === 'home')?.id)
    store.database
      .prepare('insert into drive_photo_library (item_id, root_id) values (?, ?)')
      .run(id, rootId);
}

export async function writePreview(
  rig: Pick<Rig, 'opened'>,
  itemId: string,
  rev: number,
  colour: string,
): Promise<void> {
  const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: colour } })
    .webp()
    .toBuffer();
  await writeDerived(rig.opened.layout, { itemId, rev, size: 'preview' }, bytes);
}

export function previewPath(rig: Pick<Rig, 'opened'>, itemId: string, rev: number): string {
  return derivedPath(rig.opened.layout, { itemId, rev, size: 'preview' });
}

const BODY = z.record(z.string(), z.unknown());

function fetchOf(rig: {
  sent: Sent[];
  answers: Map<string, Answer>;
  keyState: Rig['keyState'];
  byPreview: Map<string, string>;
}): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = BODY.parse(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
    rig.sent.push({ path: new URL(url).pathname, body });
    return Promise.resolve(respond(rig, new URL(url).pathname, body));
  };
}

function respond(
  rig: { answers: Map<string, Answer>; byPreview: Map<string, string> },
  path: string,
  body: Record<string, unknown>,
): Response {
  if (path.endsWith('/embeddings')) {
    const inputs = Array.isArray(body['input']) ? body['input'] : [];
    return Response.json({
      data: inputs.map((entry, index) => ({
        index,
        embedding: embeddingOf(typeof entry === 'string' ? entry : 'pet'),
      })),
      usage: { prompt_tokens: 40, cost: 0.00001 },
    });
  }
  const text = JSON.stringify(body);
  const key = [...rig.byPreview.keys()].find((candidate) => text.includes(candidate));
  const answer = rig.answers.get(key === undefined ? '*' : (rig.byPreview.get(key) ?? '*'));
  return Response.json({
    id: `gen-${String(Math.random())}`,
    choices: [{ message: { content: JSON.stringify(answer) } }],
    usage: { prompt_tokens: 1400, completion_tokens: 120, cost: 0.0004 },
  });
}

interface Parts {
  readonly opened: TestStore;
  readonly sent: Sent[];
  readonly answers: Map<string, Answer>;
  readonly byPreview: Map<string, string>;
  readonly faces: Rig['faces'];
  readonly keyState: Rig['keyState'];
  readonly runner: MediaJobRunner;
  readonly ai: PhotoAi;
}

function partsOf(opened: TestStore): Parts {
  const { store } = opened;
  const sent: Sent[] = [];
  const answers = new Map<string, Answer>();
  const byPreview = new Map<string, string>();
  const faces: Rig['faces'] = { current: [] };
  const keyState: Rig['keyState'] = { key: 'sk-test', listeners: new Set() };
  const client = new OpenRouterClient({
    fetch: fetchOf({ sent, answers, keyState, byPreview }),
    key: (): string | null => keyState.key,
  });
  const log = testLogger('photos-ai');
  const runner = new MediaJobRunner({
    jobs: new DriveMediaJobsRepository(store.context),
    limits: { cpu: 2, io: 2 },
    log,
    progress: (): void => undefined,
  });
  const detector: FaceDetector = { analyse: () => Promise.resolve(faces.current) };
  const ai = new PhotoAi({
    store,
    layout: opened.layout,
    log,
    runner,
    keys: {
      current: (): string | null => keyState.key,
      onChange: (listener): (() => void) => {
        keyState.listeners.add(listener);
        return (): void => {
          keyState.listeners.delete(listener);
        };
      },
    },
    locate: (item: DriveItem): Promise<string> =>
      Promise.resolve(join(opened.directory, item.relPath)),
    detector,
    ...openRouterClients(client, store, opened.layout.tmp),
  });
  return { opened, sent, answers, byPreview, faces, keyState, runner, ai };
}

export async function makeRig(): Promise<Rig> {
  const opened = await driveTestStore(() => new Date(NOW));
  const { store } = opened;
  const owner = store.profiles.first().id;
  const member = store.profiles.create({ name: 'Robin' }).id;
  const homeRoot = randomUUID();
  const memberRoot = randomUUID();
  insertDriveRow(store.database, { id: homeRoot, scope: 'home', ownerId: null });
  insertDriveRow(store.database, { id: memberRoot, scope: 'person', ownerId: member });
  const parts = partsOf(opened);
  const { runner, ai } = parts;
  runner.start();
  return {
    ...parts,
    owner,
    member,
    homeRoot,
    memberRoot,
    photo: async (options): Promise<string> => {
      const id = randomUUID();
      insertItem(store, id, options.root, options);
      await writePreview({ opened }, id, 1, options.colour ?? '#aabbcc');
      parts.byPreview.set((await readFile(previewPath({ opened }, id, 1))).toString('base64'), id);
      if (options.answer !== undefined) parts.answers.set(id, options.answer);
      return id;
    },
    settle: async (): Promise<void> => {
      for (let round = 0; round < 4; round += 1) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        await runner.idle();
      }
    },
    close: async (): Promise<void> => {
      ai.stop();
      await runner.stop();
      await opened.close();
    },
  };
}
