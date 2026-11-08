import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import { z } from 'zod';
import { resolveInRoot } from '../../drive/paths';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { DriveMediaJobsRepository } from '../../store/repositories/drive-media-jobs';
import type { DriveDeps } from '../../server/handlers/drive-wiring';
import { announcePhotosProgress } from '../progress';
import { HeicPool, heicDecoder, heicPoolEnvironment } from './heic';
import { MediaJobRunner, defaultLimits } from './jobs';
import { PlayableHandler } from './playable';
import { PosterHandler } from './poster';
import { PreviewDecoders, PreviewHandler, SHARP_DECODER } from './preview';
import { RAW_DECODER } from './raw';

export type PhotoPipelineDeps = Pick<DriveDeps, 'store' | 'layout' | 'log'> & {
  readonly parts: Pick<DriveDeps['parts'], 'context'>;
};

const CANDIDATE = z.strictObject({ id: z.string() });

export async function locateMedia(deps: PhotoPipelineDeps, item: DriveItem): Promise<string> {
  const root = deps.store.driveRoots.byId(item.rootId);
  if (root.path === null) throw new Error(`The media root ${root.id} has no local files.`);
  return (await resolveInRoot(root.path, item.relPath)).absolute;
}

export class PhotoPipeline {
  readonly runner: MediaJobRunner;
  private readonly media: DriveMediaRepository;
  private readonly pool: HeicPool;
  private reconciling = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: PhotoPipelineDeps) {
    const log = deps.log.forArea('hub.photos');
    const jobs = new DriveMediaJobsRepository(deps.parts.context);
    this.media = new DriveMediaRepository(deps.parts.context);
    this.pool = new HeicPool(heicPoolEnvironment(log));
    this.runner = new MediaJobRunner({
      jobs,
      limits: defaultLimits(),
      log,
      progress: (progress): void => {
        announcePhotosProgress(deps.store.feed, progress);
      },
    });
    const decoders = new PreviewDecoders();
    for (const decoder of [SHARP_DECODER, heicDecoder(this.pool), RAW_DECODER])
      decoders.register(decoder);
    const env = {
      store: { ...deps.store, driveMedia: this.media },
      layout: deps.layout,
      log,
      locate: (item: DriveItem): Promise<string> => locateMedia(deps, item),
      writeThumb: (itemId: string, thumb: DriveThumb): void => {
        this.writeThumb(itemId, thumb);
      },
    };
    this.runner.register('preview', new PreviewHandler({ ...env, decoders }));
    this.runner.register('poster', new PosterHandler(env));
    const playable = { ...env, jobs, request: this.runner.request.bind(this.runner) };
    this.runner.register('playable', new PlayableHandler(playable, 'primary'));
    this.runner.register('playable_source', new PlayableHandler(playable, 'source'));
  }

  start(): void {
    this.unsubscribe = this.deps.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') this.reconcile();
    });
    this.reconcile();
    this.runner.start();
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    await this.runner.stop();
    await this.pool.close();
  }

  reconcile(): void {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const candidates = this.deps.parts.context.sql.all(
        CANDIDATE,
        `select i.id from drive_items i join drive_media m on m.item_id = i.id
       where (i.kind = 'image' and m.preview_state = 'none' and not exists
         (select 1 from drive_media_jobs j where j.item_id = i.id and j.rev = i.rev and j.kind = 'preview'))
          or (i.kind = 'video' and ((m.poster_state = 'none' and not exists
         (select 1 from drive_media_jobs j where j.item_id = i.id and j.rev = i.rev and j.kind = 'poster'))
          or (m.playable_state = 'none' and not exists
         (select 1 from drive_media_jobs j where j.item_id = i.id and j.rev = i.rev and j.kind = 'playable'))))`,
      );
      for (const { id } of candidates) {
        const item = this.deps.store.driveItems.byId(id);
        const media = this.media.byId(id);
        this.runner.itemChanged(item);
        if (item.kind === 'image' && media.preview_state === 'none') this.request(item, 'preview');
        if (item.kind === 'video' && media.poster_state === 'none') this.request(item, 'poster');
        if (item.kind === 'video' && media.playable_state === 'none')
          this.request(item, 'playable');
      }
    } finally {
      this.reconciling = false;
    }
  }

  private request(item: DriveItem, kind: 'preview' | 'poster' | 'playable'): void {
    const jobs = new DriveMediaJobsRepository(this.deps.parts.context);
    if (jobs.forItem(item.id).some((job) => job.kind === kind && job.rev === item.rev)) return;
    this.runner.request({ kind, itemId: item.id, rev: item.rev });
  }

  private writeThumb(itemId: string, thumb: DriveThumb): void {
    const item = this.deps.store.driveItems.byId(itemId);
    if (item.kind !== 'image' && item.kind !== 'video')
      throw new Error(`The derived media item ${itemId} is not an image or video.`);
    this.deps.parts.context.sql.run(
      'record the derived media thumbnail',
      'update drive_items set thumb_state = $state, thumb_reason = $reason where id = $itemId',
      { itemId, state: thumb.state, reason: 'reason' in thumb ? thumb.reason : null },
    );
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
