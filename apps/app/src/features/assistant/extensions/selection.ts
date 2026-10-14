import type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  HarnessExtensionItem,
} from '@smarteverything/domain';

export type ExtensionChange =
  | { readonly kind: 'install'; readonly item: HarnessExtensionItem }
  | { readonly kind: 'remove'; readonly item: HarnessExtensionItem }
  | { readonly kind: 'switch'; readonly item: HarnessExtensionItem; readonly enabled: boolean };

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

class SkillProviderMissingError extends Error {
  override readonly name = 'SkillProviderMissingError';
  constructor() {
    super('Workspace skills must be installed with verified metadata before adding a skill.');
  }
}

function changedEntry(entry: HarnessDesiredEntry, change: ExtensionChange): HarnessDesiredEntry {
  if (change.kind === 'switch') return { ...entry, enabled: change.enabled };
  const selection = change.item.selection;
  if (selection.kind === 'entry') return entry;
  if (entry.metadata === undefined) throw new SkillProviderMissingError();
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
    throw new SkillProviderMissingError();
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
  if (item.selection.kind === 'skill_asset') return skillSummary(item.selection.asset.id, entry);
  return `${entry?.enabled === true ? 'On' : 'Off'} · version ${entry?.version ?? 'unavailable'}`;
}

function skillSummary(id: string, entry: HarnessDesiredEntry | undefined): string {
  const asset = entry?.metadata?.skill_assets.find((candidate) => candidate.id === id);
  return `Included in Workspace skills · ${asset?.version ?? 'version unavailable'}`;
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
