import type { AiHarnessExtensions, HarnessExtensionItem } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { IconName } from '../../../components/icon';
import { extensionIcon, matchesExtension } from './items';
import { bundledSkillHref, extensionHref } from './links';

export type CatalogueItem =
  HarnessExtensionItem | NonNullable<AiHarnessExtensions['bundled_skills']>[number];

export function catalogueItems(
  catalogue: AiHarnessExtensions | undefined,
  kind: 'extension' | 'skill',
): readonly CatalogueItem[] {
  if (catalogue === undefined) return [];
  const items = catalogue.items.filter((item) => item.kind === kind);
  return kind === 'skill' ? [...(catalogue.bundled_skills ?? []), ...items] : items;
}

export function matchesCatalogueItem(item: CatalogueItem, query: string): boolean {
  return item.kind === 'bundled_skill'
    ? `${item.name} ${item.description} ${item.publisher} skill`
        .toLowerCase()
        .includes(query.toLowerCase())
    : matchesExtension(item, query);
}

export function catalogueItemIcon(item: CatalogueItem): IconName {
  return item.kind === 'bundled_skill' ? 'fileText' : extensionIcon(item);
}

export function catalogueItemHref(item: CatalogueItem): Href {
  return item.kind === 'bundled_skill' ? bundledSkillHref(item.id) : extensionHref(item.id);
}
