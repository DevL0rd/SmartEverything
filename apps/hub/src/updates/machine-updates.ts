import {
  ApiError,
  machineUpdateTarget,
  type MachineUpdateOffer,
  type MachineUpdateQuery,
} from '@smarteverything/domain';
import type { MediaLinks } from '../server/media-links';
import type { ReleaseFolder } from './release-folder';

export class MachineUpdates {
  constructor(
    private readonly folder: ReleaseFolder,
    private readonly links: MediaLinks,
  ) {}

  async offer(query: MachineUpdateQuery): Promise<MachineUpdateOffer | null> {
    const manifest = await this.folder.manifest();
    if (manifest === null) return null;
    const artifacts = machineUpdateTarget(manifest, query);
    if (artifacts.length === 0) return null;
    const signed = artifacts.map((artifact) => ({
      artifact,
      link: this.links.machineUpdate(artifact.file),
    }));
    const [first] = signed.map(({ link }) => link.expiresAt).sort();
    if (first === undefined) return null;
    return {
      version: manifest.version,
      artifacts: signed.map(({ artifact, link }) => ({ ...artifact, url: link.url })),
      expiresAt: first,
    };
  }

  async artifact(
    file: string,
  ): Promise<{ readonly path: string; readonly size: number; readonly kind: string }> {
    const manifest = await this.folder.manifest();
    const artifact = manifest?.artifacts.find((candidate) => candidate.file === file);
    if (artifact === undefined) {
      throw new ApiError('not_found', 'No stored release has that file.');
    }
    return { path: this.folder.pathOf(artifact.file), size: artifact.size, kind: artifact.kind };
  }
}
