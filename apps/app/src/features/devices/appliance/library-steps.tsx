import type { ReactNode } from 'react';
import { useState } from 'react';
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
import { SearchField } from '../../../components/search-field';
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

function Searched({
  placeholder,
  query,
  onQuery,
  children,
}: {
  readonly placeholder: string;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-4">
      <SearchField variant="field" placeholder={placeholder} value={query} onChange={onQuery} />
      {children}
    </View>
  );
}

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
  onPick,
}: {
  readonly onPick: (category: string) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const categories = useScreenQuery({
    queryKey: irLibraryKey(),
    queryFn: listIrLibraryCategories,
    staleTime: Infinity,
  });
  return (
    <Searched placeholder="Search types" query={query} onQuery={setQuery}>
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
    </Searched>
  );
}

export function BrandStep({
  category,
  onPick,
}: {
  readonly category: string;
  readonly onPick: (brand: string) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const brands = useScreenQuery({
    queryKey: irLibraryKey(category),
    queryFn: () => listIrLibraryBrands(category),
    staleTime: Infinity,
  });
  return (
    <Searched placeholder="Search brands" query={query} onQuery={setQuery}>
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
    </Searched>
  );
}

export function ModelStep({
  category,
  brand,
  onPick,
}: {
  readonly category: string;
  readonly brand: string;
  readonly onPick: (model: IrLibraryModel) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const models = useScreenQuery({
    queryKey: irLibraryKey(category, brand),
    queryFn: () => listIrLibraryModels(category, brand),
    staleTime: Infinity,
  });
  return (
    <Searched placeholder="Search models or buttons" query={query} onQuery={setQuery}>
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
    </Searched>
  );
}
