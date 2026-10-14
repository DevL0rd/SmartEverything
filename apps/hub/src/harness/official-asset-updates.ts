import {
  ApiError,
  type HarnessDesiredEntry,
  type HarnessDiscoveryItem,
  type HarnessSkillAsset,
} from '@smarteverything/domain';

export interface OfficialAssetUpdate {
  readonly entry: HarnessDesiredEntry;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
}
interface AssetSnapshot {
  readonly commit: string;
  readonly items: readonly HarnessDiscoveryItem[];
}

export async function prepareOfficialAssetUpdate(
  entry: HarnessDesiredEntry,
  snapshot: AssetSnapshot,
  resolve: (url: string, previous?: HarnessSkillAsset) => Promise<HarnessSkillAsset>,
): Promise<OfficialAssetUpdate> {
  if (entry.metadata === undefined)
    throw new ApiError('conflict', 'Shared asset metadata is absent.');
  const replacements: HarnessSkillAsset[] = [];
  let unchanged = 0;
  let skipped = 0;
  for (const item of snapshot.items) {
    if (item.acquisition.state !== 'available') {
      skipped += 1;
      continue;
    }
    const current = entry.metadata.skill_assets.find((asset) => asset.id === item.id);
    if (current?.version === snapshot.commit) {
      unchanged += 1;
      continue;
    }
    const next = await resolve(item.acquisition.url, current);
    if (current?.version === next.version) unchanged += 1;
    else replacements.push(next);
  }
  return {
    entry:
      replacements.length === 0
        ? entry
        : {
            ...entry,
            metadata: {
              ...entry.metadata,
              skill_assets: [
                ...entry.metadata.skill_assets.filter(
                  (asset) => !replacements.some((next) => next.id === asset.id),
                ),
                ...replacements,
              ],
            },
          },
    updated: replacements.length,
    unchanged,
    skipped,
  };
}
