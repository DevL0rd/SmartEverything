import type { ReactNode, ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '../text';
import { HeaderSlotContext } from '../screen-context';
import { FeedChrome } from './feed-chrome';
import { feedItems, sessionRemovable, type FeedItem } from './feed-items';
import { ReaderState } from './reader-state';
import { SessionHeader } from './session-header';
import { TranscriptRow } from './transcript-row';
import { useFeedScroll } from './use-feed-scroll';
import type { TranscriptFeedState, TranscriptRemoval } from './state';

export interface TranscriptFeedProps {
  readonly feed: TranscriptFeedState;
  readonly timeZone: string;
  readonly grouped: boolean;
  readonly remove?: TranscriptRemoval;
  readonly header?: ReactNode;
  readonly pageHeader?: ReactElement;
  readonly banner?: ReactNode;
  readonly controls?: ReactNode;
  readonly maxWidth?: 'dashboard' | 'detail';
  readonly focus?: boolean;
  readonly focusSearch?: boolean;
}

interface FeedHeaderProps extends TranscriptFeedProps {
  readonly layout: (event: LayoutChangeEvent) => void;
  readonly top: () => void;
}

function FeedFooter({ feed }: { readonly feed: TranscriptFeedState }): ReactNode {
  const quiet = feed.rows.length === 0 || (feed.older && !feed.loadingOlder);
  return (
    <View className="pb-section-gap">
      {quiet ? null : (
        <View className="py-3">
          <Text variant="caption" tone="variant" align="center">
            {feed.older ? 'Loading older lines…' : 'Start of available transcript'}
          </Text>
        </View>
      )}
    </View>
  );
}

function FeedHeader({
  header,
  pageHeader,
  banner,
  controls,
  focusSearch,
  feed,
  layout,
  top,
}: FeedHeaderProps): ReactNode {
  const back = (): void => {
    feed.back();
    top();
  };
  const latest = (): void => {
    feed.latest();
    top();
  };
  return (
    <View className="gap-section-gap pb-3">
      <HeaderSlotContext.Provider value="large">{pageHeader}</HeaderSlotContext.Provider>
      {banner}
      {header}
      <View onLayout={layout}>
        <FeedChrome
          words={feed.words}
          changeWords={feed.changeWords}
          context={feed.context}
          missingAnchor={feed.missingAnchor}
          back={back}
          latest={latest}
          controls={controls}
          focusSearch={focusSearch === true}
        />
        <ReaderState
          error={feed.error}
          loading={feed.loading}
          empty={feed.rows.length === 0}
          missingAnchor={feed.missingAnchor}
          words={feed.settled}
          retry={feed.refresh}
        />
      </View>
    </View>
  );
}

function renderItem(
  item: FeedItem,
  props: TranscriptFeedProps,
  anchorReady: () => void,
): ReactElement {
  const { feed, timeZone, grouped, remove } = props;
  if (item.kind === 'day')
    return (
      <Text key={item.key} variant="label" tone="variant" className="px-4 pb-1 pt-4">
        {item.label}
      </Text>
    );
  if (item.kind === 'session')
    return (
      <SessionHeader
        key={item.key}
        session={item.session}
        timeZone={timeZone}
        remove={remove !== undefined && sessionRemovable(item.session) ? remove.session : undefined}
      />
    );
  const { hit } = item;
  const highlighted = feed.anchor === hit.line.id;
  return (
    <TranscriptRow
      key={item.key}
      hit={hit}
      timeZone={timeZone}
      showSource={!grouped}
      highlighted={highlighted}
      ready={highlighted ? anchorReady : undefined}
      open={
        feed.settled === '' || feed.context
          ? undefined
          : (): void => {
              feed.open(hit.line.id);
            }
      }
      remove={remove?.line}
    />
  );
}

const FEED_DRAW_DISTANCE = 1000;

function itemKey(item: FeedItem): string {
  return item.key;
}

function itemType(item: FeedItem): FeedItem['kind'] {
  return item.kind;
}

function FeedViewport(props: TranscriptFeedProps): ReactNode {
  const { feed, timeZone, grouped } = props;
  const items = feedItems(feed.rows, { timeZone, grouped });
  const { listRef, layout, jump, top, scroll, anchorReady } = useFeedScroll(
    items,
    feed.anchor,
    props.focus === true,
  );
  return (
    <FlashList<FeedItem>
      ref={listRef}
      data={items}
      keyExtractor={itemKey}
      getItemType={itemType}
      keyboardShouldPersistTaps="handled"
      drawDistance={FEED_DRAW_DISTANCE}
      ListHeaderComponent={<FeedHeader {...props} layout={layout} top={top} />}
      ListFooterComponent={<FeedFooter feed={feed} />}
      onScroll={scroll}
      scrollEventThrottle={16}
      onContentSizeChange={jump}
      onEndReached={feed.loadOlder}
      onEndReachedThreshold={0.3}
      onStartReached={feed.loadNewer}
      onStartReachedThreshold={0.3}
      renderItem={({ item }) => renderItem(item, props, anchorReady)}
    />
  );
}

export function TranscriptFeed({
  maxWidth = 'dashboard',
  ...props
}: TranscriptFeedProps): ReactNode {
  return (
    <View
      className={
        maxWidth === 'detail'
          ? 'min-h-0 w-full max-w-detail flex-1 self-center px-gutter'
          : 'min-h-0 w-full max-w-dashboard flex-1 self-center px-gutter'
      }
    >
      <FeedViewport {...props} />
    </View>
  );
}
