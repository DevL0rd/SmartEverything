import type {
  AiHarnessExtensions,
  HarnessDiscoveryItem,
  HarnessDiscoveryPage,
  HarnessExtensionItem,
} from '@smarteverything/domain';
import type { VirtualSection } from '../../../components/virtual-list';
import {
  installedCatalogueItems,
  matchesCatalogueItem,
  type CatalogueItem,
} from './catalogue-items';
import type { DiscoverySelection } from './discovery';
import { offerInstallation, offerKey, type OfferInstallation } from './offer-source';

interface OnlineRow {
  readonly origin: 'online';
  readonly item: HarnessDiscoveryItem;
  readonly installation: OfferInstallation;
}

export type BrowseItem = { readonly origin: 'local'; readonly item: CatalogueItem } | OnlineRow;

export function browseItemKey(row: BrowseItem): string {
  return row.origin === 'local' ? row.item.id : offerKey(row.item);
}

function onlineRows(
  pages: readonly HarnessDiscoveryPage[],
  installed: ReadonlyMap<string, HarnessExtensionItem>,
  shownLocally: ReadonlySet<string>,
): readonly OnlineRow[] {
  const rows = new Map<string, OnlineRow>();
  for (const page of pages) {
    for (const item of page.items) {
      const installation = offerInstallation(item, installed.get(item.id));
      if (installation.status === 'installed' && shownLocally.has(installation.item.id)) continue;
      const key = offerKey(item);
      if (!rows.has(key)) rows.set(key, { origin: 'online', item, installation });
    }
  }
  return [...rows.values()];
}

export function browseSections(
  selection: DiscoverySelection,
  catalogue: AiHarnessExtensions | undefined,
  pages: readonly HarnessDiscoveryPage[],
  includeLocal = true,
): readonly VirtualSection<BrowseItem>[] {
  const local =
    selection.source === undefined && (includeLocal || pages[0]?.total === 0)
      ? installedCatalogueItems(catalogue, selection.kind).filter((item) =>
          matchesCatalogueItem(item, selection.query),
        )
      : [];
  const installed = new Map(catalogue?.items.map((item) => [item.id, item] as const));
  const online = onlineRows(pages, installed, new Set(local.map((item) => item.id)));
  const sections: readonly VirtualSection<BrowseItem>[] = [
    {
      key: 'local',
      title: 'Included and installed',
      data: local.map((item) => ({ origin: 'local', item })),
    },
    { key: 'online', title: 'Online catalogue', data: online },
  ];
  return sections.filter((section) => section.data.length > 0);
}
