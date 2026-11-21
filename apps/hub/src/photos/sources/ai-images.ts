import type { PhotoSource } from '@smarteverything/domain';
import { DriveSpaceMissingError } from '../../drive/spaces';
import { Keeper, safeName } from './keeper';
import { keptFileName } from './reads';
import type { SourcePage, SourceQuery, SourceService, SourceViewer, SourcesEnv } from './shapes';

export const MADE_WITH_AI = 'Made with AI';

export interface AiImageSourceOptions {
  readonly env: SourcesEnv;
  readonly attachmentPath: (storagePath: string) => string;
}

export class AiImageSource implements SourceService {
  readonly source: PhotoSource = 'ai';
  private readonly keeper: Keeper;

  constructor(private readonly options: AiImageSourceOptions) {
    this.keeper = new Keeper(options.env);
  }

  page(viewer: SourceViewer, query: SourceQuery): Promise<SourcePage> {
    return this.options.env.store.host.read('photoAiImagePage', { viewer, query });
  }

  async keep(viewer: SourceViewer, itemIds: readonly string[]): Promise<number> {
    const { host } = this.options.env.store;
    const { profileId } = viewer;
    const images = await host.read('photoAiImages', { profileId, itemIds });
    return await this.keeper.serialized(async () => {
      const root = await host.call('driveRoots', 'byIdentity', 'person', profileId);
      if (root === undefined) throw new DriveSpaceMissingError('person', profileId);
      let copied = 0;
      for (const image of images) {
        if (await host.read('photoAiImageKept', { profileId, sha256: image.sha256 })) continue;
        await this.keeper.copy({
          root,
          folders: [MADE_WITH_AI],
          name: safeName(keptFileName(image), image.id),
          source: this.options.attachmentPath(image.storage_path),
          actor: { actorProfileId: profileId, via: 'app', deviceId: null },
        });
        copied += 1;
      }
      return copied;
    });
  }
}
