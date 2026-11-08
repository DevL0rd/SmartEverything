import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SettingsFrame } from '../../../settings/settings-frame';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { SearchField } from '../../../components/search-field';
import { NavRow } from '../../../components/rows';
import { ListRow } from '../../../components/list-row';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { EmptyState } from '../../../components/empty-state';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useExtensions } from './queries';
import { useMemberBanner } from './query-status';
import { useSkillInspection } from './inspection';
import { discoveryItemKey, type DiscoverySelection } from './discovery';
import { discoveryHref } from './links';
import { browseItemKey, browseSections, type BrowseItem } from './browse-items';
import { catalogueItemHref, catalogueItemIcon } from './catalogue-items';
import { BrowseFooter, BrowseStatus } from './browse-status';
import { useBrowse, type BrowseModel } from './use-browse';
import { offerSourceLabel } from './offer-source';

const OFFER_BADGES = {
  available: undefined,
  installed: 'Installed',
  conflict: 'Name in use',
} as const;

function ImportRow({
  kind,
  onImport,
}: {
  readonly kind: DiscoverySelection['kind'];
  readonly onImport: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  if (kind !== 'skill' || !owner) return null;
  return (
    <NavRow
      icon="link"
      title="From a skill link"
      subtitle={live ? 'Browse a git repository or marketplace' : 'Needs your home hub'}
      disabled={!live}
      onPress={onImport}
    />
  );
}

function BrowseRow({ row }: { readonly row: BrowseItem }): ReactNode {
  const client = useQueryClient();
  const router = useRouter();
  if (row.origin === 'local') {
    const { item } = row;
    return (
      <NavRow
        icon={catalogueItemIcon(item)}
        title={item.name}
        subtitle={item.description}
        caption={item.publisher}
        value={
          item.kind === 'bundled_skill' || item.source.kind === 'included'
            ? 'Included'
            : 'Installed'
        }
        href={catalogueItemHref(item)}
      />
    );
  }
  const { item: offer, installation } = row;
  const badge = OFFER_BADGES[installation.status];
  const source = offerSourceLabel(offer);
  return (
    <ListRow
      icon={offer.kind === 'skill' ? 'fileText' : 'puzzle'}
      title={offer.name}
      subtitle={`${offer.publisher} · ${source}`}
      wrapSubtitle
      caption={offer.description}
      label={
        badge === undefined
          ? `${offer.name}, ${source}, ${offer.publisher}`
          : `${offer.name}, ${source}, ${offer.publisher}, ${badge}`
      }
      chevron
      {...(badge === undefined ? {} : { value: badge })}
      onPress={() => {
        client.setQueryData(discoveryItemKey(offer.reference), offer);
        router.push(discoveryHref(offer));
      }}
    />
  );
}

export function BrowseAiExtensionsScreen({
  kind,
}: {
  readonly kind: DiscoverySelection['kind'];
}): ReactNode {
  const banner = useMemberBanner(
    kind === 'skill'
      ? 'browse online sources or add skills'
      : 'browse online sources or add extensions',
  );
  const inspection = useSkillInspection(kind);
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/add' : 'assistant/extensions/add'}
      scroll={false}
      {...(banner === undefined ? {} : { banner })}
    >
      <BrowseList kind={kind} onImport={inspection.open} />
      <TextEditSheet request={inspection.request} onClose={inspection.close} />
    </SettingsFrame>
  );
}

function useBrowseSections(
  model: BrowseModel,
  installed: ReturnType<typeof useExtensions>,
): readonly VirtualSection<BrowseItem>[] {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const query = model.query.trim();
  const pages = model.waiting ? [] : (model.discovery.data?.pages ?? []);
  const includeLocal = query !== '' || !owner || !live || model.discovery.isError;
  return browseSections({ ...model.selection, query }, installed.data, pages, includeLocal);
}

function BrowseList({
  kind,
  onImport,
}: {
  readonly kind: DiscoverySelection['kind'];
  readonly onImport: () => void;
}): ReactNode {
  const model = useBrowse(kind);
  const installed = useExtensions();
  const sections = useBrowseSections(model, installed);
  const noun = kind === 'skill' ? 'skills' : 'extensions';
  const source = model.selection.source;
  return (
    <>
      <View className="w-full max-w-reading gap-3 px-gutter pb-3">
        <SearchField
          value={model.query}
          onChange={model.changeQuery}
          placeholder={`Search ${noun}`}
          variant="field"
        />
        {source === undefined ? null : (
          <Banner
            tone="info"
            title="Browsing one source"
            body={source.url}
            wrapBody
            action={{ label: 'All sources', onPress: model.clearSource, variant: 'outlined' }}
          />
        )}
      </View>
      <VirtualList
        header={
          <View className="gap-3 px-gutter pb-3">
            <BrowseStatus kind={kind} installed={installed} model={model} />
            <ImportRow kind={kind} onImport={onImport} />
          </View>
        }
        sections={sections}
        keyOf={browseItemKey}
        renderItem={(row) => <BrowseRow row={row} />}
        {...(model.discovery.error === null ? { onEndReached: model.loadMore } : {})}
        footer={<BrowseFooter model={model} />}
        empty={<BrowseEmpty noun={noun} installed={installed} model={model} />}
      />
    </>
  );
}

function useBrowseReady(model: BrowseModel, installed: ReturnType<typeof useExtensions>): boolean {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const online = model.discovery.data?.pages[0];
  if (model.waiting || model.discovery.isFetching) return false;
  if (model.selection.source === undefined && (installed.isFetching || installed.error !== null))
    return false;
  if (!owner) return true;
  return live && online?.unavailable_sources.length === 0;
}

function BrowseEmpty({
  noun,
  installed,
  model,
}: {
  readonly noun: string;
  readonly installed: ReturnType<typeof useExtensions>;
  readonly model: BrowseModel;
}): ReactNode {
  if (!useBrowseReady(model, installed)) return null;
  return model.query.trim() === '' ? (
    <EmptyState
      icon={noun === 'skills' ? 'fileText' : 'puzzle'}
      title={`No ${noun} available`}
      body="There are no entries in the sources you can browse."
    />
  ) : (
    <EmptyState
      icon="search"
      title={`No ${noun} match “${model.query.trim()}”`}
      body="Search by name, description or publisher."
      action={
        <Button
          label="Clear search"
          variant="text"
          onPress={() => {
            model.changeQuery('');
          }}
        />
      }
    />
  );
}
