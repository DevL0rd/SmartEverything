import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../data-layout';
import type { OpenRouterPlatform } from '../../openrouter/platform';
import type { Store } from '../../store/store';
import { BUNDLED_FACES_WORKER, FacePool } from '../../vision/faces/pool';
import { visionAssetDirectory } from '../../vision/models';
import { defaultLimits } from '../pipeline/jobs';
import type { PhotoPipeline } from '../pipeline/runtime';
import { locateMedia } from '../pipeline/runtime';
import { PhotoAi, openRouterClients } from './service';

export interface PhotoAiWiring {
  readonly store: Store;
  readonly layout: HubLayout;
  readonly log: Logger;
  readonly pipeline: PhotoPipeline;
  readonly openRouter: Pick<OpenRouterPlatform, 'client' | 'keys'>;
}

export interface RunningPhotoAi {
  readonly ai: PhotoAi;
  readonly stop: () => Promise<void>;
}

export function startPhotoAi(wiring: PhotoAiWiring): RunningPhotoAi {
  const { store, layout, log, pipeline, openRouter } = wiring;
  const pool = new FacePool({
    script: BUNDLED_FACES_WORKER,
    directory: visionAssetDirectory(),
    threads: defaultLimits().cpu,
  });
  const clients = openRouterClients(openRouter.client, store, layout.tmp);
  const ai = new PhotoAi({
    store,
    layout,
    log,
    runner: pipeline.runner,
    keys: openRouter.keys,
    locate: (item): Promise<string> =>
      locateMedia({ store, layout, log, parts: { context: store.context } }, item),
    detector: pool,
    ...clients,
  });
  ai.start();
  return {
    ai,
    stop: async (): Promise<void> => {
      ai.stop();
      await pool.close();
    },
  };
}
