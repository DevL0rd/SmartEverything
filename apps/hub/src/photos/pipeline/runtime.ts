import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import { z } from 'zod';
import { resolveInRoot } from '../../drive/paths';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { DriveMediaJobsRepository } from '../../store/repositories/drive-media-jobs';
import type { DriveDeps } from '../../server/handlers/drive-wiring';
import { Coalesced } from '../../store/reader';
import { inSlices } from '../../store/slices';
import { announcePhotosProgress } from '../progress';
import { HeicPool, heicDecoder, heicPoolEnvironment } from './heic';
import { MediaJobRunner, defaultLimits } from './jobs';
import { vaapiDevice } from '../../media/ffmpeg-path';
import { PlayableHandler } from './playable';
import { PosterHandler } from './poster';
import { PreviewDecoders, PreviewHandler, SHARP_DECODER, type PreviewFile } from './preview';
import { RAW_DECODER } from './raw';
import { decodeOnGpu } from './vaapi-decode';

export type PhotoPipelineDeps = Pick<DriveDeps, 'store' | 'layout' | 'log'> & {
  readonly parts: Pick<DriveDeps['parts'], 'context'>;
};

const CANDIDATE = z.strictObject({
  id: z.string(),
  rev: z.int().positive(),
  kind: z.enum(['preview', 'poster', 'playable']),
});

const CURRENT = z.strictObject({ found: z.literal(1) });

function missing(kind: 'preview' | 'poster' | 'playable', needs: string): string {
  return `select i.id, i.rev, '${kind}' as kind
    from drive_media m cross join drive_items i on i.id = m.item_id
    where ${needs} and not exists (select 1 from drive_media_jobs j
      where j.item_id = i.id and j.rev = i.rev and j.kind = '${kind}')`;
}

export async function locateMedia(deps: PhotoPipelineDeps, item: DriveItem): Promise<string> {
  const root = deps.store.driveRoots.byId(item.rootId);
  return (await resolveInRoot(root.path, item.relPath)).absolute;
}

export class PhotoPipeline {
  readonly runner: MediaJobRunner;
  readonly decoders = new PreviewDecoders();
  private readonly media: DriveMediaRepository;
  private readonly pool: HeicPool;
  private readonly pass: Coalesced;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: PhotoPipelineDeps) {
    const log = deps.log.forArea('hub.photos');
    const jobs = new DriveMediaJobsRepository(deps.parts.context);
    this.media = new DriveMediaRepository(deps.parts.context);
    this.pool = new HeicPool(heicPoolEnvironment(log));
    this.pass = new Coalesced(
      () => this.reconcile(),
      (cause) => {
        log.error('photos.reconcile_failed', cause);
      },
    );
    this.runner = new MediaJobRunner({
      jobs,
      limits: defaultLimits(),
      log,
      progress: (progress): void => {
        announcePhotosProgress(deps.store.feed, progress);
      },
    });
    for (const decoder of [SHARP_DECODER, heicDecoder(this.pool), RAW_DECODER])
      this.decoders.register(decoder);
    const env = {
      store: { ...deps.store, driveMedia: this.media },
      layout: deps.layout,
      log,
      locate: (item: DriveItem): Promise<string> => locateMedia(deps, item),
      writeThumb: (itemId: string, thumb: DriveThumb): void => {
        this.writeThumb(itemId, thumb);
      },
    };
    const gpu =
      vaapiDevice() === null
        ? undefined
        : {
            accepts: (file: PreviewFile): boolean =>
              file.mime.startsWith('image/') && !RAW_DECODER.accepts(file),
            decode: decodeOnGpu,
          };
    this.runner.register('preview', new PreviewHandler({ ...env, decoders: this.decoders, gpu }));
    this.runner.register('poster', new PosterHandler(env));
    const playable = { ...env, jobs, request: this.runner.request.bind(this.runner) };
    this.runner.register('playable', new PlayableHandler(playable, 'primary'));
    this.runner.register('playable_source', new PlayableHandler(playable, 'source'));
  }

  start(): void {
    this.unsubscribe = this.deps.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') this.refresh();
    });
    this.refresh();
    this.runner.start();
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    await this.pass.stop();
    await this.runner.stop();
    await this.pool.close();
  }

  refresh(): void {
    this.pass.trigger();
  }

  async idle(): Promise<void> {
    do {
      await this.pass.idle();
      await this.runner.idle();
    } while (this.pass.busy);
  }

  async reconcile(): Promise<void> {
    const candidates = await this.deps.store.reader.all(
      CANDIDATE,
      `${missing('preview', "i.kind = 'image' and m.preview_state = 'none'")}
       union all ${missing('poster', "i.kind = 'video' and m.poster_state = 'none'")}
       union all ${missing('playable', "i.kind = 'video' and m.playable_state = 'none'")}`,
    );
    await inSlices(this.deps.parts.context, candidates, (candidate) => {
      if (!this.current(candidate.id, candidate.rev)) return;
      this.runner.itemChanged(candidate.id, candidate.rev);
      this.runner.request({ kind: candidate.kind, itemId: candidate.id, rev: candidate.rev });
    });
  }

  private current(itemId: string, rev: number): boolean {
    return (
      this.deps.parts.context.sql.get(
        CURRENT,
        'select 1 as found from drive_items where id = $itemId and rev = $rev',
        { itemId, rev },
      ) !== undefined
    );
  }

  private writeThumb(itemId: string, thumb: DriveThumb): void {
    const item = this.deps.store.driveItems.byId(itemId, null);
    if (item.kind !== 'image' && item.kind !== 'video')
      throw new Error(`The derived media item ${itemId} is not an image or video.`);
    this.deps.parts.context.sql.run(
      'record the derived media thumbnail',
      'update drive_items set thumb_state = $state, thumb_reason = $reason where id = $itemId',
      { itemId, state: thumb.state, reason: 'reason' in thumb ? thumb.reason : null },
    );
    this.runner.touched(itemId);
    this.deps.store.feed.notice({
      type: 'drive_changed',
      rootIds: [item.rootId],
      folderIds: item.parentId === null ? [] : [item.parentId],
      albumIds: [],
      months: item.takenAt === null ? [] : [item.takenAt.slice(0, 7)],
      cursor: this.deps.store.driveFeed.latestSeq(),
    });
  }
}
