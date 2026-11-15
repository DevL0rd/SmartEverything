import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IrLibraryModel } from '@smarteverything/domain';
import {
  listIrLibraryBrands,
  listIrLibraryCategories,
  listIrLibraryModels,
} from '../../../api/ir-appliances';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { LoadedQuery } from '../../../components/loaded-query';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { irLibraryKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  categoryIcon,
  countLabel,
  matching,
  modelSubtitle,
  modelTitle,
  modelWords,
} from './add-appliance-model';

const LOADING_ROWS = 5;

function NothingFound({ query }: { readonly query: string }): ReactNode {
  return query.trim() === '' ? (
    <EmptyState
      icon="remote"
      title="No library loaded"
      body="The hub has no infrared library yet."
    />
  ) : (
    <EmptyState icon="search" title="Nothing found" body={`Nothing matches “${query}”.`} />
  );
}

function RowsLoading({ title }: { readonly title: string }): ReactNode {
  return (
    <List title={title}>
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <View key={index} className="min-h-row-h flex-row items-center gap-4 px-4 py-2">
          <Skeleton shape="circle" />
          <Skeleton shape="text" className="w-2/5" />
        </View>
      ))}
    </List>
  );
}

export function CategoryStep({
  query,
  onPick,
}: {
  readonly query: string;
  readonly onPick: (category: string) => void;
}): ReactNode {
  const categories = useScreenQuery({
    queryKey: irLibraryKey(),
    queryFn: listIrLibraryCategories,
    staleTime: Infinity,
  });
  return (
    <LoadedQuery query={categories} loading={<RowsLoading title="What is it?" />}>
      {(all) => {
        const shown = matching(all, query, (one) => [one.category]);
        return shown.length === 0 ? (
          <NothingFound query={query} />
        ) : (
          <List title="What is it?">
            {shown.map((one) => (
              <ListRow
                key={one.category}
                title={one.category}
                icon={categoryIcon(one.category)}
                value={countLabel(one.models)}
                chevron
                onPress={() => {
                  onPick(one.category);
                }}
              />
            ))}
          </List>
        );
      }}
    </LoadedQuery>
  );
}

export function BrandStep({
  category,
  query,
  onPick,
}: {
  readonly category: string;
  readonly query: string;
  readonly onPick: (brand: string) => void;
}): ReactNode {
  const brands = useScreenQuery({
    queryKey: irLibraryKey(category),
    queryFn: () => listIrLibraryBrands(category),
    staleTime: Infinity,
  });
  return (
    <LoadedQuery query={brands} loading={<RowsLoading title="Brand" />}>
      {(all) => {
        const shown = matching(all, query, (one) => [one.brand]);
        return shown.length === 0 ? (
          <NothingFound query={query} />
        ) : (
          <List title="Brand">
            {shown.map((one) => (
              <ListRow
                key={one.brand}
                title={one.brand}
                value={countLabel(one.models)}
                chevron
                onPress={() => {
                  onPick(one.brand);
                }}
              />
            ))}
          </List>
        );
      }}
    </LoadedQuery>
  );
}

export function ModelStep({
  category,
  brand,
  query,
  onPick,
}: {
  readonly category: string;
  readonly brand: string;
  readonly query: string;
  readonly onPick: (model: IrLibraryModel) => void;
}): ReactNode {
  const models = useScreenQuery({
    queryKey: irLibraryKey(category, brand),
    queryFn: () => listIrLibraryModels(category, brand),
    staleTime: Infinity,
  });
  return (
    <LoadedQuery query={models} loading={<RowsLoading title="Model" />}>
      {(all) => {
        const shown = matching(all, query, modelWords);
        return shown.length === 0 ? (
          <NothingFound query={query} />
        ) : (
          <List
            title="Model"
            footer="Pick the model printed on the appliance or its remote. Any close match usually works too."
          >
            {shown.map((one) => (
              <ListRow
                key={one.id}
                title={modelTitle(one)}
                subtitle={modelSubtitle(one)}
                wrapSubtitle
                icon="remote"
                chevron
                onPress={() => {
                  onPick(one);
                }}
              />
            ))}
          </List>
        );
      }}
    </LoadedQuery>
  );
}
