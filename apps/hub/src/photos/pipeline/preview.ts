import sharp, { type Sharp } from 'sharp';
import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { DriveItemsRepository } from '../../store/repositories/drive-items';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { Store } from '../../store/store';
import { DERIVED_LONG_EDGE, pruneDerived, writeDerived, type DerivedLayout } from './derived-paths';
import type { JobHandler } from './jobs';
import type { GpuOutcome } from './vaapi-decode';
import { UNLIMITED_PIXELS } from '../../media/sharp-input';

export const PREVIEW_QUALITY = 82;

export const THUMB_QUALITY = 74;

export interface PreviewFile {
  readonly path: string;
  readonly mime: string;
  readonly name: string;
}

export type DecodedSource =
  | { readonly kind: 'encoded'; readonly path: string }
  | {
      readonly kind: 'pixels';
      readonly data: Uint8Array;
      readonly width: number;
      readonly height: number;
    };

export type DecodeOutcome =
  | { readonly kind: 'decoded'; readonly source: DecodedSource }
  | { readonly kind: 'unsupported'; readonly reason: string };

export interface PreviewDecoder {
  readonly id: string;
  readonly accepts: (file: PreviewFile) => boolean;
  readonly decode: (file: PreviewFile, signal: AbortSignal) => Promise<DecodeOutcome>;
}

export class PreviewDecoders {
  private readonly decoders: PreviewDecoder[] = [];

  register(decoder: PreviewDecoder): void {
    if (this.decoders.some((known) => known.id === decoder.id)) {
      throw new Error(`the preview decoder ${decoder.id} is already registered`);
    }
    this.decoders.push(decoder);
  }

  find(file: PreviewFile): PreviewDecoder | undefined {
    return this.decoders.find((decoder) => decoder.accepts(file));
  }
}

const SHARP_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
]);

export const SHARP_DECODER: PreviewDecoder = {
  id: 'sharp',
  accepts: (file) => SHARP_MIMES.has(file.mime),
  decode: (file) =>
    Promise.resolve({ kind: 'decoded', source: { kind: 'encoded', path: file.path } }),
};

export interface RenderedDerived {
  readonly preview: Buffer;
  readonly thumb: Buffer;
  readonly width: number;
  readonly height: number;
}

const RGBA_CHANNELS = 4;

function inputOf(source: DecodedSource): Sharp {
  return source.kind === 'encoded'
    ? sharp(source.path, UNLIMITED_PIXELS)
    : sharp(source.data, {
        ...UNLIMITED_PIXELS,
        raw: { width: source.width, height: source.height, channels: RGBA_CHANNELS },
      });
}

function fitted(image: Sharp, edge: number): Sharp {
  return image.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
}

export async function renderDerived(source: DecodedSource): Promise<RenderedDerived> {
  const preview = await fitted(
    inputOf(source).autoOrient().toColourspace('srgb'),
    DERIVED_LONG_EDGE.preview,
  )
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer({ resolveWithObject: true });
  const thumb = await fitted(sharp(preview.data), DERIVED_LONG_EDGE.thumb)
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
  return {
    preview: preview.data,
    thumb,
    width: preview.info.width,
    height: preview.info.height,
  };
}

export interface GpuDecoder {
  readonly accepts: (file: PreviewFile) => boolean;
  readonly decode: (file: PreviewFile, signal: AbortSignal) => Promise<GpuOutcome>;
}

export type DerivedOutcome =
  | { readonly state: 'ready' }
  | { readonly state: 'failed' | 'unsupported'; readonly reason: string };

export type ThumbWriter = (itemId: string, thumb: DriveThumb) => void;

export interface PreviewEnvironment {
  readonly store: Pick<Store, 'write'> & {
    readonly driveItems: Pick<DriveItemsRepository, 'find'>;
    readonly driveMedia: Pick<DriveMediaRepository, 'find' | 'update'>;
  };
  readonly writeThumb: ThumbWriter;
  readonly decoders: PreviewDecoders;
  readonly gpu?: GpuDecoder | undefined;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly layout: DerivedLayout;
  readonly log: Logger;
}

function thumbOf(outcome: DerivedOutcome): DriveThumb {
  return outcome.state === 'ready'
    ? { state: 'ready' }
    : { state: outcome.state, reason: outcome.reason };
}

function mediaPatchOf(outcome: DerivedOutcome): Parameters<DriveMediaRepository['update']>[1] {
  return outcome.state === 'ready'
    ? { preview_state: 'ready', preview_reason: null }
    : { preview_state: outcome.state, preview_reason: outcome.reason };
}

export class PreviewHandler implements JobHandler {
  readonly resource = 'image';

  constructor(private readonly env: PreviewEnvironment) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = this.current(job);
    if (item === undefined) return;
    const file = { path: await this.env.locate(item), mime: item.mime, name: item.name };
    const decoded = await this.decode(job, file, signal);
    if (decoded === undefined) return;
    if (decoded.kind === 'unsupported') {
      this.record(job, { state: 'unsupported', reason: decoded.reason });
      return;
    }
    const rendered = await renderDerived(decoded.source);
    await writeDerived(
      this.env.layout,
      { itemId: job.item_id, rev: job.rev, size: 'preview' },
      rendered.preview,
    );
    await writeDerived(
      this.env.layout,
      { itemId: job.item_id, rev: job.rev, size: 'thumb' },
      rendered.thumb,
    );
    if (this.record(job, { state: 'ready' })) {
      await pruneDerived(this.env.layout, job.item_id, job.rev);
    }
  }

  fail(job: DriveMediaJob, cause: unknown): void {
    this.record(job, { state: 'failed', reason: messageOf(cause) });
  }

  private async decode(
    job: DriveMediaJob,
    file: PreviewFile,
    signal: AbortSignal,
  ): Promise<DecodeOutcome | undefined> {
    const gpu = this.env.gpu;
    if (gpu?.accepts(file) === true) {
      const outcome = await gpu.decode(file, signal);
      if (outcome.kind === 'decoded') return outcome;
      this.env.log.info('photos.preview_decoded_on_cpu', {
        itemId: job.item_id,
        mime: file.mime,
        reason: outcome.reason,
      });
    }
    const decoder = this.env.decoders.find(file);
    if (decoder === undefined) {
      this.record(job, { state: 'unsupported', reason: `no decoder reads ${file.mime}` });
      return undefined;
    }
    return decoder.decode(file, signal);
  }

  private current(job: DriveMediaJob): Extract<DriveItem, { readonly kind: 'image' }> | undefined {
    const item = this.env.store.driveItems.find(job.item_id, null);
    if (
      item?.kind !== 'image' ||
      item.rev !== job.rev ||
      this.env.store.driveMedia.find(item.id) === undefined
    ) {
      this.env.log.debug('photos.preview_skipped', { itemId: job.item_id, rev: job.rev });
      return undefined;
    }
    return item;
  }

  private record(job: DriveMediaJob, outcome: DerivedOutcome): boolean {
    return this.env.store.write(() => {
      if (this.current(job) === undefined) return false;
      this.env.writeThumb(job.item_id, thumbOf(outcome));
      this.env.store.driveMedia.update(job.item_id, mediaPatchOf(outcome));
      return true;
    });
  }
}
