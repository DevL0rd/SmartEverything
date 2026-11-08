import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { DriveItem } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { load } from 'exifreader';
import { z } from 'zod';
import type { DriveItemsRepository } from '../../store/repositories/drive-items';
import type { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { Store } from '../../store/store';
import { derivedDirectory, pruneDerived, type DerivedLayout } from './derived-paths';
import type { JobHandler } from './jobs';
import { probeVideo } from './probe';
import { withFileReader, type RangeReader } from './raw';

export interface MotionClip {
  readonly offset: number;
  readonly length: number;
}

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

const APPLE_MAKER_NOTE_HEADER = 14;

const CONTENT_IDENTIFIER_TAG = 0x11;

const MAKER_NOTE = z
  .object({
    exif: z
      .object({
        MakerNote: z
          .object({ value: z.array(z.number()) })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const ATTRIBUTE = /([\w:]+)="([^"]*)"/gu;

const START_OF_SCAN = 0xda;

const XMP_SEGMENT = 0xe1;

export function motionClipPath(layout: DerivedLayout, itemId: string, rev: number): string {
  return join(derivedDirectory(layout, itemId), `${itemId}-${String(rev)}-motion.mp4`);
}

function attributesOf(element: string): ReadonlyMap<string, string> {
  return new Map([...element.matchAll(ATTRIBUTE)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

function wholeNumber(value: string | undefined): number {
  const parsed = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(value ?? '0');
  return parsed.success ? parsed.data : 0;
}

export function clipLocation(xmp: string, fileSize: number): MotionClip | undefined {
  const items = [...xmp.matchAll(/<Container:Item\b[^>]*>/gu)].map((match) =>
    attributesOf(match[0]),
  );
  const item = items.find((attributes) => attributes.get('Item:Semantic') === 'MotionPhoto');
  if (item !== undefined) {
    const length = wholeNumber(item.get('Item:Length'));
    const start = fileSize - length - wholeNumber(item.get('Item:Padding'));
    return length > 0 && start >= 0 ? { offset: start, length } : undefined;
  }
  const micro = wholeNumber(attributesOf(xmp).get('GCamera:MicroVideoOffset'));
  return micro > 0 && micro <= fileSize ? { offset: fileSize - micro, length: micro } : undefined;
}

async function xmpPacket(reader: RangeReader): Promise<string | undefined> {
  let at = 2;
  while (at + 4 <= reader.size) {
    const head = await reader.read(at, 4);
    const marker = head[1];
    if (head[0] !== 0xff || marker === undefined || marker === START_OF_SCAN) return undefined;
    const length = head.readUInt16BE(2);
    if (marker === XMP_SEGMENT) {
      const body = await reader.read(at + 4, length - 2);
      if (body.toString('latin1', 0, XMP_HEADER.length) === XMP_HEADER) {
        return body.toString('utf8', XMP_HEADER.length);
      }
    }
    at += 2 + length;
  }
  return undefined;
}

async function startsWithMp4(reader: RangeReader, clip: MotionClip): Promise<boolean> {
  const head = await reader.read(clip.offset, 8);
  return head.toString('latin1', 4, 8) === 'ftyp';
}

export async function findMotionClip(reader: RangeReader): Promise<MotionClip | undefined> {
  const start = await reader.read(0, 2);
  if (start[0] !== 0xff || start[1] !== 0xd8) return undefined;
  const xmp = await xmpPacket(reader);
  const clip = xmp === undefined ? undefined : clipLocation(xmp, reader.size);
  return clip !== undefined && (await startsWithMp4(reader, clip)) ? clip : undefined;
}

export async function extractMotionClip(
  source: string,
  clip: MotionClip,
  target: string,
): Promise<void> {
  const staged = `${target}.${String(process.pid)}.partial`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await pipeline(
      createReadStream(source, { start: clip.offset, end: clip.offset + clip.length - 1 }),
      createWriteStream(staged),
    );
    await rename(staged, target);
  } catch (cause) {
    await rm(staged, { force: true });
    throw cause;
  }
}

export function appleContentIdentifier(bytes: readonly number[]): string | null {
  const note = Buffer.from(bytes);
  if (note.toString('latin1', 0, 9) !== 'Apple iOS') return null;
  const entries = note.readUInt16BE(APPLE_MAKER_NOTE_HEADER);
  for (let index = 0; index < entries; index++) {
    const entry = APPLE_MAKER_NOTE_HEADER + 2 + index * 12;
    if (note.readUInt16BE(entry) !== CONTENT_IDENTIFIER_TAG) continue;
    const length = note.readUInt32BE(entry + 4);
    const offset = note.readUInt32BE(entry + 8);
    return note.toString('latin1', offset, offset + length - 1);
  }
  return null;
}

export async function stillLiveId(path: string): Promise<string | null> {
  const tags = MAKER_NOTE.parse(load(await readFile(path), { expanded: true }));
  const note = tags.exif?.MakerNote;
  return note === undefined ? null : appleContentIdentifier(note.value);
}

export interface MotionEnvironment {
  readonly store: Pick<Store, 'write'> & {
    readonly driveItems: Pick<DriveItemsRepository, 'find'>;
    readonly driveMedia: Pick<DriveMediaRepository, 'find' | 'update' | 'withLiveId'>;
  };
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly layout: DerivedLayout;
  readonly log: Logger;
}

export class MotionHandler implements JobHandler {
  readonly resource = 'io';

  constructor(private readonly env: MotionEnvironment) {}

  async run(job: DriveMediaJob): Promise<void> {
    const item = this.env.store.driveItems.find(job.item_id);
    if (item?.rev !== job.rev || this.env.store.driveMedia.find(item.id) === undefined) {
      this.env.log.debug('photos.motion_skipped', { itemId: job.item_id, rev: job.rev });
      return;
    }
    if (item.kind === 'image') await this.runImage(item);
    if (item.kind === 'video') await this.runVideo(item);
  }

  fail(job: DriveMediaJob, cause: unknown): void {
    this.env.log.warn('photos.motion_failed', { itemId: job.item_id, reason: messageOf(cause) });
  }

  private async runImage(item: Extract<DriveItem, { readonly kind: 'image' }>): Promise<void> {
    const path = await this.env.locate(item);
    const clip = await withFileReader(path, findMotionClip);
    if (clip !== undefined) {
      await extractMotionClip(path, clip, motionClipPath(this.env.layout, item.id, item.rev));
      await pruneDerived(this.env.layout, item.id, item.rev);
      this.env.store.write(() =>
        this.env.store.driveMedia.update(item.id, { motion_clip_id: item.id }),
      );
      return;
    }
    const liveId = await stillLiveId(path);
    if (liveId !== null) this.pair(item.id, liveId);
  }

  private async runVideo(item: Extract<DriveItem, { readonly kind: 'video' }>): Promise<void> {
    const { liveId } = await probeVideo(await this.env.locate(item));
    if (liveId !== null) this.pair(item.id, liveId);
  }

  private pair(itemId: string, liveId: string): void {
    this.env.store.write(() => {
      this.env.store.driveMedia.update(itemId, { live_id: liveId });
      const rows = this.env.store.driveMedia.withLiveId(liveId);
      const kinds = new Map(
        rows.map((row) => [row.item_id, this.env.store.driveItems.find(row.item_id)?.kind]),
      );
      const clip = rows.find((row) => kinds.get(row.item_id) === 'video');
      if (clip === undefined) return;
      for (const row of rows.filter((known) => kinds.get(known.item_id) === 'image')) {
        this.env.store.driveMedia.update(row.item_id, { motion_clip_id: clip.item_id });
      }
    });
  }
}
