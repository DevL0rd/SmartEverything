import type { PhotoSource } from '@smarteverything/domain';
import { DriveSpaceMissingError } from '../../drive/spaces';
import { Keeper, safeName } from './keeper';
import { SAVED, SAVED_CAMERAS, savedName } from './reads';
import type { SourcePage, SourceQuery, SourceService, SourceViewer, SourcesEnv } from './shapes';

export interface CameraSourceOptions {
  readonly env: SourcesEnv;
  readonly recordingPath: (storagePath: string) => string;
  readonly permitted: () => readonly string[];
}

export class CameraSource implements SourceService {
  readonly source: PhotoSource = 'cameras';
  private readonly keeper: Keeper;

  constructor(private readonly options: CameraSourceOptions) {
    this.keeper = new Keeper(options.env);
  }

  page(viewer: SourceViewer, query: SourceQuery): Promise<SourcePage> {
    return this.options.env.store.host.read('photoCameraPage', {
      viewer,
      query,
      permitted: this.options.permitted(),
    });
  }

  async keep(viewer: SourceViewer, itemIds: readonly string[]): Promise<number> {
    const { host } = this.options.env.store;
    const { recordings } = await host.read('photoCameraKeepPlan', {
      viewer,
      itemIds,
      permitted: this.options.permitted(),
    });
    return await this.keeper.serialized(async () => {
      const root = await host.call('driveRoots', 'byIdentity', 'home', null);
      if (root === undefined) throw new DriveSpaceMissingError('home', null);
      let copied = 0;
      for (const recording of recordings) {
        const name = savedName(recording);
        if ((await host.read('photoCameraKept', { names: [name] })).length > 0) continue;
        await this.keeper.copy({
          root,
          folders: [SAVED, SAVED_CAMERAS, safeName(recording.cameraName, recording.device_id)],
          name,
          source: this.options.recordingPath(recording.storage_path),
          actor: { actorProfileId: viewer.profileId, via: 'app', deviceId: null },
        });
        copied += 1;
      }
      return copied;
    });
  }
}
