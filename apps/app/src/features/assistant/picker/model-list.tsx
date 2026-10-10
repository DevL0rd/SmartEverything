import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ModelChoice } from './model-choice';
import { ModelRow } from './model-row';
import { ProviderLogo } from './provider-logo';

export const MODEL_ROW_HEIGHT = 72;
const HEADER_HEIGHT = 40;

export type ListItem =
  | { readonly type: 'header'; readonly key: string; readonly title: string }
  | { readonly type: 'model'; readonly key: string; readonly model: ModelChoice }
  | {
      readonly type: 'link';
      readonly key: string;
      readonly title: string;
      readonly detail: string | null;
      readonly provider: string | null;
      readonly onPress: () => void;
    };

export interface ModelListProps {
  readonly items: readonly ListItem[];
  readonly selected: string | null;
  readonly favourites: ReadonlySet<string>;
  readonly onPick: ((model: ModelChoice) => void) | null;
  readonly onFavourite: ((modelId: string) => void) | null;
  readonly onEnd: (() => void) | null;
  readonly loading: boolean;
}

function heightOf(item: ListItem): number {
  return item.type === 'header' ? HEADER_HEIGHT : MODEL_ROW_HEIGHT;
}

function LinkRow({ item }: { readonly item: Extract<ListItem, { type: 'link' }> }): ReactNode {
  return (
    <Interactive
      label={item.title}
      onPress={item.onPress}
      className="h-model-row flex-row items-center gap-3 rounded-lg px-3"
      layerClassName="rounded-lg"
    >
      {item.provider === null ? (
        <View className="size-9 items-center justify-center rounded-md bg-surface-3">
          <Icon name="layers" size={20} tone="variant" />
        </View>
      ) : (
        <ProviderLogo provider={item.provider} name={item.title} />
      )}
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {item.title}
      </Text>
      {item.detail === null ? null : (
        <Text variant="caption" tone="variant">
          {item.detail}
        </Text>
      )}
      <Icon name="chevronRight" size={20} tone="variant" />
    </Interactive>
  );
}

function Item({
  item,
  list,
}: {
  readonly item: ListItem;
  readonly list: ModelListProps;
}): ReactNode {
  const { selected, favourites, onPick, onFavourite } = list;
  switch (item.type) {
    case 'header':
      return (
        <View className="h-list-header justify-end px-3 pb-1">
          <Text variant="label" tone="variant">
            {item.title}
          </Text>
        </View>
      );
    case 'link':
      return <LinkRow item={item} />;
    case 'model':
      return (
        <ModelRow
          model={item.model}
          selected={selected === item.model.id}
          favourite={favourites.has(item.model.id)}
          onPick={
            onPick === null
              ? null
              : (): void => {
                  onPick(item.model);
                }
          }
          onFavourite={
            onFavourite === null
              ? null
              : (): void => {
                  onFavourite(item.model.id);
                }
          }
        />
      );
  }
}

function Footer({ loading }: { readonly loading: boolean }): ReactNode {
  const tint = useColour('primary');
  return loading ? (
    <View className="items-center py-4">
      <ActivityIndicator color={tint} />
    </View>
  ) : null;
}

export function ModelList(props: ModelListProps): ReactNode {
  const offsets = props.items.reduce<number[]>(
    (all, item, index) => [...all, (all[index] ?? 0) + heightOf(item)],
    [0],
  );
  return (
    <FlatList
      data={props.items}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => <Item item={item} list={props} />}
      getItemLayout={(_data, index) => ({
        length: (offsets[index + 1] ?? 0) - (offsets[index] ?? 0),
        offset: offsets[index] ?? 0,
        index,
      })}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      {...(props.onEnd === null ? {} : { onEndReached: props.onEnd })}
      onEndReachedThreshold={0.5}
      ListFooterComponent={<Footer loading={props.loading} />}
      className="min-h-0 flex-1"
    />
  );
}
