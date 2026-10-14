import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import { ModelList, type ListItem } from './model-list';
import { ModelSearchControls, type SearchControlProps } from './model-search-controls';
import { ModelSearchSource } from './model-search-source';
import { retainedSearchItems, allSearchItems } from './model-search-candidates';
import type { SearchPickerData } from './model-search-data';
interface Props {
  readonly data: SearchPickerData;
  readonly controls: SearchControlProps;
  readonly details: boolean;
  readonly toggleDetails: () => void;
  readonly clearSearch: () => void;
}
function SearchControls(props: Props): ReactNode {
  return (
    <View className="gap-2 px-3 py-2">
      <ModelSearchControls {...props.controls} />
      {props.data.makers.error === null ? null : (
        <Button
          label="Retry makers"
          variant="text"
          onPress={(): void => {
            void props.data.makers.refetch();
          }}
        />
      )}
      <Text variant="caption" tone="variant" accessibilityLiveRegion="polite">
        {props.data.pages.total === null
          ? 'Loading models'
          : `${String(props.data.pages.total)} catalogue matches · ${String(props.data.rows.nativeCount)} native choices`}
      </Text>
      {props.data.rows.nativeCount === 0 ? null : (
        <Text variant="caption" tone="variant">
          Native choices are shown first; sorting applies to the remaining models.
        </Text>
      )}
      <ModelSearchSource
        pages={props.data.pages}
        sort={props.controls.sort}
        details={props.details}
        toggle={props.toggleDetails}
      />
    </View>
  );
}
function SearchStatus(props: Props): ReactNode {
  const { data } = props;
  return (
    <View className="gap-1 px-3 py-2">
      {data.sources.native.status}
      {data.sources.harness.status}
      {data.pages.updated ? (
        <Text variant="caption" tone="variant" accessibilityLiveRegion="polite">
          Models updated
        </Text>
      ) : null}
      {data.validation.ok ? null : (
        <Text variant="caption" tone="critical" accessibilityLiveRegion="polite">
          {data.validation.message}
        </Text>
      )}
      {data.pages.error === null ? null : (
        <>
          <Text variant="caption" tone="warning">
            Models could not be loaded.
          </Text>
          <Button label="Retry models" onPress={data.pages.retry} variant="text" />
        </>
      )}
      {data.validation.ok &&
      !data.pages.pending &&
      !data.pages.loading &&
      data.pages.error === null &&
      data.rows.all.length === 0 ? (
        <>
          <Text variant="caption" tone="variant">
            No models match this search.
          </Text>
          <Button label="Clear search" onPress={props.clearSearch} variant="text" />
        </>
      ) : null}
      {data.pages.more === null ? null : (
        <Button label="Load more models" onPress={data.pages.more} variant="text" />
      )}
    </View>
  );
}
export function ModelSearchResults(props: Props): ReactNode {
  const items: readonly ListItem[] = [
    ...retainedSearchItems(props.data.rows),
    { type: 'custom', key: 'all:controls', render: (): ReactNode => <SearchControls {...props} /> },
    ...allSearchItems(props.data.rows),
    { type: 'custom', key: 'all:status', render: (): ReactNode => <SearchStatus {...props} /> },
  ];
  return (
    <ModelList
      items={items}
      resetKey={props.data.key}
      selected={null}
      favourites={new Set()}
      onFavourite={null}
      onPick={null}
      onEnd={props.data.pages.more}
      loading={props.data.pages.loading}
    />
  );
}
