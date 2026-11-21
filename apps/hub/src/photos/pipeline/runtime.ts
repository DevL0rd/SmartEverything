import type { DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { resolveInRoot } from '../../drive/paths';
import type { DriveDeps } from '../../server/handlers/drive-wiring';
import { Coalesced } from '../../store/reader';
import { announcePhotosProgress } from '../progress';
import type { DerivedRecord } from './derived-units';
import { HeicPool, heicDecoder, heicPoolEnvironment } from './heic';
import { hostedJobs, type JobCandidate } from './job-units';
import { MediaJobRunner, defaultLimits } from './jobs';
import { vaapiDevice } from '../../media/ffmpeg-path';
import { PlayableHandler } from './playable';
import { PosterHandler } from './poster';
import { PreviewDecoders, PreviewHandler, SHARP_DECODER, type PreviewFile } from './preview';
import { RAW_DECODER } from './raw';
import { decodeOnGpu } from './vaapi-decode';

export type PhotoPipelineDeps = Pick<DriveDeps, 'store' | 'layout' | 'log'>;

const CANDIDATE = z.strictObject({
  id: z.string(),
  rev: z.int().positive(),
  kind: z.enum(['preview', 'poster', 'playable']),
});

const RECONCILE_BATCH = 256;

function missing(kind: 'preview' | 'poster' | 'playable', needs: string): string {
  return `select i.id, i.rev, '${kind}' as kind
    from drive_media m cross join drive_items i on i.id = m.item_id
    where ${needs} and not exists (select 1 from drive_media_jobs j
      where j.item_id = i.id and j.rev = i.rev and j.kind = '${kind}')`;
}

export async function locateMedia(
  deps: Pick<PhotoPipelineDeps, 'store'>,
  item: DriveItem,
): Promise<string> {
  const root = await deps.store.host.call('driveRoots', 'byId', item.rootId);
  return (await resolveInRoot(root.path, item.relPath)).absolute;
}

export class PhotoPipeline {
  readonly runner: MediaJobRunner;
  readonly decoders = new PreviewDecoders();
  private readonly pool: HeicPool;
  private readonly pass: Coalesced;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: PhotoPipelineDeps) {
    const log = deps.log.forArea('hub.photos');
    const jobs = hostedJobs(deps.store.host);
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
      derived: {
        current: (target: DerivedRecord['target']): Promise<DriveItem | undefined> =>
          deps.store.host.read('photoDerivedCurrent', target),
        record: (record: DerivedRecord): Promise<boolean> => this.record(record),
      },
      layout: deps.layout,
      log,
      locate: (item: DriveItem): Promise<string> => locateMedia(deps, item),
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

  async start(): Promise<void> {
    this.unsubscribe = this.deps.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') this.refresh();
    });
    this.refresh();
    await this.runner.start();
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
    for (let at = 0; at < candidates.length; at += RECONCILE_BATCH) {
      const batch: JobCandidate[] = candidates.slice(at, at + RECONCILE_BATCH);
      this.runner.adopt(await this.deps.store.host.write('photoJobsReconcile', batch));
    }
  }

  private async record(record: DerivedRecord): Promise<boolean> {
    const recorded = await this.deps.store.host.write('photoDerivedRecord', record);
    if (recorded && record.thumb !== null) this.runner.touched(record.target.itemId);
    return recorded;
  }
}
