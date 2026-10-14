import { assetProviderName } from './items';
import type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  HarnessExtensionItem,
  JsonValue,
} from '@smarteverything/domain';

export type ExtensionChange =
  | { readonly kind: 'install'; readonly item: HarnessExtensionItem }
  | { readonly kind: 'remove'; readonly item: HarnessExtensionItem }
  | { readonly kind: 'switch'; readonly item: HarnessExtensionItem; readonly enabled: boolean }
  | {
      readonly kind: 'setting';
      readonly item: HarnessExtensionItem;
      readonly key: string;
      readonly value: JsonValue;
      readonly label: string;
      readonly defaultValue: JsonValue;
    };

export function entryId(item: HarnessExtensionItem): string {
  return item.selection.kind === 'entry' ? item.selection.entry.id : item.selection.parent_id;
}

export function selectedEntry(
  item: HarnessExtensionItem,
  desired: HarnessDesiredConfiguration,
): HarnessDesiredEntry | undefined {
  return desired.entries.find((entry) => entry.id === entryId(item));
}

export function isSelected(
  item: HarnessExtensionItem,
  desired: HarnessDesiredConfiguration,
): boolean {
  const entry = selectedEntry(item, desired);
  if (item.selection.kind === 'entry') return entry !== undefined;
  const id = item.selection.asset.id;
  return entry?.metadata?.skill_assets.some((asset) => asset.id === id) === true;
}

class AssetProviderMissingError extends Error {
  override readonly name = 'AssetProviderMissingError';
  constructor() {
    super(
      'The capability provider must be installed with verified metadata before adding an asset.',
    );
  }
}

function changedEntry(entry: HarnessDesiredEntry, change: ExtensionChange): HarnessDesiredEntry {
  if (change.kind === 'switch') return { ...entry, enabled: change.enabled };
  if (change.kind === 'setting')
    return { ...entry, config: { ...entry.config, [change.key]: change.value } };
  const selection = change.item.selection;
  if (selection.kind === 'entry') return entry;
  if (entry.metadata === undefined) throw new AssetProviderMissingError();
  const assets = entry.metadata.skill_assets.filter((asset) => asset.id !== selection.asset.id);
  if (change.kind === 'install') assets.push(selection.asset);
  return { ...entry, metadata: { ...entry.metadata, skill_assets: assets } };
}

export function applyExtensionChange(
  desired: HarnessDesiredConfiguration,
  change: ExtensionChange,
  revision: string,
): HarnessDesiredConfiguration {
  const id = entryId(change.item);
  const selection = change.item.selection;
  const existing = selectedEntry(change.item, desired);
  if (existing === undefined && selection.kind === 'skill_asset')
    throw new AssetProviderMissingError();
  if (existing === undefined && selection.kind === 'entry' && change.kind === 'install')
    return { revision, entries: [...desired.entries, selection.entry] };
  const entries = desired.entries
    .filter((entry) => !(entry.id === id && change.kind === 'remove' && selection.kind === 'entry'))
    .map((entry) => (entry.id === id ? changedEntry(entry, change) : entry));
  return { revision, entries };
}

export function selectionSummary(
  item: HarnessExtensionItem,
  desired: HarnessDesiredConfiguration,
): string {
  if (!isSelected(item, desired)) return 'Not added';
  const entry = selectedEntry(item, desired);
  if (item.selection.kind === 'skill_asset')
    return assetSummary(item.selection.asset.id, item.selection.parent_id, entry);
  return `${entry?.enabled === true ? 'On' : 'Off'} · version ${entry?.version ?? 'unavailable'}`;
}

function assetSummary(
  id: string,
  parentId: 'skills' | 'claude-plugins',
  entry: HarnessDesiredEntry | undefined,
): string {
  const asset = entry?.metadata?.skill_assets.find((candidate) => candidate.id === id);
  return `Included in ${assetProviderName(parentId)} · ${asset?.version ?? 'version unavailable'}`;
}

export function requiresSkillUpdate(
  item: HarnessExtensionItem,
  desired: HarnessDesiredConfiguration,
): boolean {
  if (item.selection.kind !== 'skill_asset') return false;
  const incoming = item.selection.asset;
  const asset = selectedEntry(item, desired)?.metadata?.skill_assets.find(
    (candidate) => candidate.id === incoming.id,
  );
  return asset !== undefined && JSON.stringify(asset) !== JSON.stringify(incoming);
}
