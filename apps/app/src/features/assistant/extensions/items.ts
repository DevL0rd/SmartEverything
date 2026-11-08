import type { HarnessExtensionItem, HarnessExtensionPatch } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type ExtensionPlatform = HarnessExtensionItem['platforms'][number];
export const SKILLS_EXTENSION_ID = 'skills';

const PLATFORM_LABELS: Readonly<Record<ExtensionPlatform, string>> = {
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
  android: 'Android',
};

export function platformLabel(platform: ExtensionPlatform): string {
  return PLATFORM_LABELS[platform];
}

export function pageKind(item: Pick<HarnessExtensionItem, 'kind' | 'id'>): 'skill' | 'extension' {
  return item.kind === 'skill' || item.id === SKILLS_EXTENSION_ID ? 'skill' : 'extension';
}

export function extensionIcon(item: HarnessExtensionItem): IconName {
  return pageKind(item) === 'skill' ? 'fileText' : 'puzzle';
}

export function matchesExtension(item: HarnessExtensionItem, query: string): boolean {
  return `${item.name} ${item.description} ${item.publisher} ${item.kind}`
    .toLowerCase()
    .includes(query.toLowerCase());
}

export function patched(
  item: HarnessExtensionItem,
  patch: HarnessExtensionPatch,
): HarnessExtensionItem {
  return {
    ...item,
    enabled: patch.enabled ?? item.enabled,
    config: patch.config ?? item.config,
    confirmed: patch.confirm_executes === true ? item.executes : item.confirmed,
  };
}
