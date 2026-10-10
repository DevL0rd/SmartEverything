import type { ReactElement, ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { View, type FlatList } from 'react-native';
import Animated, { type useAnimatedScrollHandler } from 'react-native-reanimated';
import { Interactive } from '../components/interactive';
import { ListRow } from '../components/list-row';
import { Section, SectionAction } from '../components/section';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import type { SearchCatalogue } from './catalogue';
import { NodeRow } from './node-row';
import type { ResultNode } from './nodes';
import type { SearchRow } from './result-rows';
import { RowFrame, type ResultsLook } from './row-frame';

export interface SearchListModel {
  readonly rows: readonly SearchRow[];
  readonly query: string;
  readonly catalogue: SearchCatalogue;
  readonly look: ResultsLook;
  readonly selectedKey: string | null;
  readonly keyboard: boolean;
  readonly navigating: boolean;
  readonly onOpen: (node: ResultNode) => void;
  readonly onToggle: (key: string, expanded: boolean) => void;
  readonly onShowAll: (target: string) => void;
  readonly onQuery: (query: string) => void;
  readonly onClearRecent: () => void;
}

interface RowProps {
  readonly row: SearchRow;
  readonly first: boolean;
  readonly model: SearchListModel;
}

function GroupRow({ row, first, model }: RowProps): ReactNode {
  if (row.kind !== 'group') {
    return null;
  }
  const gap = model.look === 'page' ? 'pt-section-gap' : 'pt-3';
  return (
    <Section
      title={row.label}
      className={cn(first ? 'pt-1' : gap, 'pb-1')}
      action={row.clear ? <SectionAction label="Clear" onPress={model.onClearRecent} /> : null}
    >
      {null}
    </Section>
  );
}

function RowBody({ row, model }: RowProps): ReactNode {
  switch (row.kind) {
    case 'node':
      return (
        <NodeRow
          node={row.node}
          depth={row.depth}
          parent={row.parent}
          expandable={row.expandable}
          expanded={row.expanded}
          catalogue={model.catalogue}
          onOpen={model.onOpen}
          onToggle={model.onToggle}
        />
      );
    case 'more':
      return (
        <Interactive
          label={`Show all ${String(row.total)}`}
          onPress={() => {
            model.onShowAll(row.target);
          }}
          className="min-h-touch-min justify-center px-4"
        >
          <Text variant="callout" tone="primary">{`Show all ${String(row.total)}`}</Text>
        </Interactive>
      );
    case 'query':
      return (
        <ListRow
          title={row.text}
          icon={row.icon}
          onPress={() => {
            model.onQuery(row.text);
          }}
        />
      );
    case 'group':
      return null;
  }
}

function ResultRowView(props: RowProps): ReactNode {
  const { row, model } = props;
  if (row.kind === 'group') {
    return <GroupRow {...props} />;
  }
  return (
    <RowFrame
      look={model.look}
      edge={row.edge}
      depth={row.depth}
      selected={model.keyboard ? model.selectedKey === row.key : false}
    >
      <RowBody {...props} />
    </RowFrame>
  );
}

function NoMatches({ query }: { readonly query: string }): ReactElement | null {
  if (query === '') {
    return null;
  }
  return (
    <View className="items-center gap-1 px-6 py-10">
      <Text variant="body-strong" align="center">
        {`No matches for “${query}”`}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        Try a device, page or setting name.
      </Text>
    </View>
  );
}

function useScrollToSelected(
  list: RefObject<FlatList<SearchRow> | null>,
  model: SearchListModel,
): void {
  const index = model.rows.findIndex((row) => row.key === model.selectedKey);
  useEffect(() => {
    if (model.navigating && index >= 0) {
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    }
  }, [list, index, model.navigating]);
}

interface ResultListProps {
  readonly model: SearchListModel;
  readonly contentClassName?: string;
  readonly onScroll?: ReturnType<typeof useAnimatedScrollHandler>;
  readonly footer?: ReactElement;
  readonly grow?: boolean;
}

export function ResultList({
  model,
  contentClassName,
  onScroll,
  footer,
  grow = true,
}: ResultListProps): ReactNode {
  const list = useRef<FlatList<SearchRow>>(null);
  useScrollToSelected(list, model);
  return (
    <Animated.FlatList
      ref={list}
      data={model.rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item, index }) => (
        <ResultRowView row={item} first={index === 0} model={model} />
      )}
      ListEmptyComponent={<NoMatches query={model.query} />}
      {...(footer === undefined ? {} : { ListFooterComponent: footer })}
      {...(onScroll === undefined ? {} : { onScroll })}
      scrollEventThrottle={16}
      onScrollToIndexFailed={(failed) => {
        list.current?.scrollToOffset({ offset: failed.averageItemLength * failed.index });
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={24}
      windowSize={7}
      className={grow ? 'flex-1' : 'shrink grow-0'}
      {...(contentClassName === undefined ? {} : { contentContainerClassName: contentClassName })}
    />
  );
}
