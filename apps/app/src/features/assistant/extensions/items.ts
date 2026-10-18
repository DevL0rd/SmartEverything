import type { HarnessExtensionItem, HarnessExtensionPatch } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type ExtensionPlatform = HarnessExtensionItem['platforms'][number];

const PLATFORM_LABELS: Readonly<Record<ExtensionPlatform, string>> = {
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
  android: 'Android',
};

export function platformLabel(platform: ExtensionPlatform): string {
  return PLATFORM_LABELS[platform];
}

export function pageKind(item: HarnessExtensionItem): 'skill' | 'extension' {
  return item.kind === 'skill' ? 'skill' : 'extension';
}

export function extensionIcon(item: HarnessExtensionItem): IconName {
  return item.kind === 'skill' ? 'fileText' : 'puzzle';
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
