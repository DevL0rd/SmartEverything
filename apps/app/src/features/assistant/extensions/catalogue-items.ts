import type { AiHarnessExtensions, HarnessExtensionItem } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { IconName } from '../../../components/icon';
import { extensionIcon, matchesExtension, pageKind } from './items';
import { bundledSkillHref, extensionHref } from './links';

export type CatalogueItem =
  HarnessExtensionItem | NonNullable<AiHarnessExtensions['bundled_skills']>[number];

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
  return item.kind === 'bundled_skill'
    ? bundledSkillHref(item.id)
    : extensionHref(item.id, pageKind(item));
}
