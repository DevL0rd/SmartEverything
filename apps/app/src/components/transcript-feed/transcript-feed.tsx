import type { ReactNode, ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '../text';
import { cn } from '../../design/cn';
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
  readonly inlineControls?: boolean;
  readonly compactRows?: boolean;
  readonly headerWidth?: 'dashboard' | 'detail' | 'full';
  readonly focus?: boolean;
  readonly focusSearch?: boolean;
}

const HEADER_WIDTH = {
  dashboard: 'max-w-dashboard',
  detail: 'max-w-detail',
  full: '',
} as const;

const READER_WIDTH = 'w-full max-w-detail self-start';

interface FeedHeaderProps extends TranscriptFeedProps {
  readonly layout: (event: LayoutChangeEvent) => void;
  readonly top: () => void;
}

function FeedFooter({ feed }: { readonly feed: TranscriptFeedState }): ReactNode {
  const quiet = feed.rows.length === 0 || (feed.older && !feed.loadingOlder);
  return (
    <View className={cn('pb-section-gap', READER_WIDTH)}>
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

function FeedHeaderContent({
  banner,
  header,
  width,
}: {
  readonly banner: ReactNode;
  readonly header: ReactNode;
  readonly width: keyof typeof HEADER_WIDTH;
}): ReactNode {
  if (banner === undefined && header === undefined) return null;
  return (
    <View className={cn('gap-section-gap w-full self-start', HEADER_WIDTH[width])}>
      {banner}
      {header}
    </View>
  );
}

function FeedHeader({
  header,
  pageHeader,
  banner,
  controls,
  inlineControls,
  focusSearch,
  headerWidth = 'full',
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
      <FeedHeaderContent banner={banner} header={header} width={headerWidth} />
      <View onLayout={layout} className={READER_WIDTH}>
        <FeedChrome
          words={feed.words}
          changeWords={feed.changeWords}
          context={feed.context}
          missingAnchor={feed.missingAnchor}
          back={back}
          latest={latest}
          controls={controls}
          inlineControls={inlineControls === true}
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
      compact={props.compactRows === true}
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
      renderItem={({ item }) => {
        const content = renderItem(item, props, anchorReady);
        return <View className={READER_WIDTH}>{content}</View>;
      }}
    />
  );
}

export function TranscriptFeed(props: TranscriptFeedProps): ReactNode {
  return (
    <View className="min-h-0 w-full flex-1 px-gutter">
      <FeedViewport {...props} />
    </View>
  );
}
