import type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  HarnessExtensionItem,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

const INCLUDED: Readonly<Record<string, { readonly name: string; readonly description: string }>> =
  {
    codegraph: {
      name: 'Workspace indexer',
      description: 'Understand the files and symbols in a workspace.',
    },
    skills: {
      name: 'Workspace skills',
      description: 'Discover skills available in each workspace.',
    },
  };

export function extensionIcon(item: HarnessExtensionItem): IconName {
  return item.kind === 'skill' || item.id === 'skills' ? 'fileText' : 'puzzle';
}

function pinnedItem(entry: HarnessDesiredEntry): HarnessExtensionItem {
  const presentation = INCLUDED[entry.id];
  return {
    id: entry.id,
    kind: 'extension',
    included: presentation !== undefined,
    name: presentation?.name ?? entry.id,
    description:
      presentation?.description ??
      'Pinned shared extension. View its source and reported device status.',
    publisher: entry.metadata?.provenance ?? 'Publisher not reported',
    capabilities: [],
    requirements: ['File access and sign-ins stay on each device.'],
    runtimes: presentation === undefined ? [] : ['smarteverything'],
    platforms: entry.metadata?.platforms ?? [],
    selection: { kind: 'entry', entry },
    acquisition: {
      state: 'unsupported',
      reason: 'This pinned selection is not available in the current catalogue.',
    },
  };
}

export function installedItems(
  items: readonly HarnessExtensionItem[],
  desired: HarnessDesiredConfiguration,
): readonly HarnessExtensionItem[] {
  const entries = desired.entries.map((entry): HarnessExtensionItem => {
    const item = items.find(
      (candidate) =>
        candidate.selection.kind === 'entry' && candidate.selection.entry.id === entry.id,
    );
    return item === undefined
      ? pinnedItem(entry)
      : { ...item, selection: { kind: 'entry', entry } };
  });
  const assets = desired.entries.flatMap((entry) => {
    if (entry.id !== 'skills' && entry.id !== 'claude-plugins') return [];
    const parent_id = entry.id;
    return (entry.metadata?.skill_assets ?? []).map(
      (asset): HarnessExtensionItem =>
        items.find(
          (item) => item.selection.kind === 'skill_asset' && item.selection.asset.id === asset.id,
        ) ?? {
          id: `skill-asset:${asset.id}`,
          kind: parent_id === 'skills' ? 'skill' : 'extension',
          included: false,
          name: asset.id,
          description: `Included in ${assetProviderName(parent_id)}.`,
          publisher: 'Publisher not reported',
          capabilities: [],
          requirements: [`${assetProviderName(parent_id)} must be enabled on a compatible device.`],
          runtimes: ['smarteverything'],
          platforms: entry.metadata?.platforms ?? [],
          selection: { kind: 'skill_asset', parent_id, asset },
          acquisition: {
            state: 'unsupported',
            reason: 'This pinned asset is not available in the current catalogue.',
          },
        },
    );
  });
  return [...entries, ...assets];
}

export function matchesExtension(item: HarnessExtensionItem, query: string): boolean {
  return `${item.name} ${item.description} ${item.publisher} ${item.kind} ${item.acquisition.state === 'available' ? item.acquisition.format : ''}`
    .toLowerCase()
    .includes(query.toLowerCase());
}

export function assetProviderName(parentId: 'skills' | 'claude-plugins'): string {
  return parentId === 'skills' ? 'Workspace skills' : 'Coding plugins';
}
