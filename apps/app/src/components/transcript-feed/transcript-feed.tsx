import type { ReactNode, ReactElement } from 'react';
import { FlatList, View, type LayoutChangeEvent } from 'react-native';
import type { TranscriptHit } from '@smarteverything/domain';
import { Button } from '../button';
import { Text } from '../text';
import { HeaderSlotContext } from '../screen-context';
import { FeedChrome } from './feed-chrome';
import { ReaderState } from './reader-state';
import { TranscriptRow } from './transcript-row';
import { useFeedScroll } from './use-feed-scroll';
import type { TranscriptFeedState } from './state';

export interface TranscriptFeedProps {
  readonly feed: TranscriptFeedState;
  readonly timeZone: string;
  readonly remove?: (hit: TranscriptHit) => void;
  readonly header?: ReactNode;
  readonly pageHeader?: ReactElement;
  readonly banner?: ReactNode;
  readonly controls?: ReactNode;
  readonly maxWidth?: 'dashboard' | 'detail';
  readonly focus?: boolean;
  readonly focusSearch?: boolean;
}

function Paging({ feed }: { readonly feed: TranscriptFeedState }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-2 py-3">
      {feed.newer ? (
        <Button
          label="Newer lines"
          icon="arrowUp"
          variant="text"
          loading={feed.loadingNewer}
          onPress={feed.loadNewer}
        />
      ) : null}
      {feed.older ? (
        <Button
          label="Older lines"
          icon="arrowDown"
          variant="text"
          loading={feed.loadingOlder}
          onPress={feed.loadOlder}
        />
      ) : (
        <Text variant="caption" tone="variant">
          Start of available transcript
        </Text>
      )}
    </View>
  );
}

interface FeedHeaderProps extends TranscriptFeedProps {
  readonly layout: (event: LayoutChangeEvent) => void;
  readonly top: () => void;
}

function FeedStatus({ feed }: { readonly feed: TranscriptFeedState }): ReactNode {
  return (
    <>
      <ReaderState
        error={feed.error}
        loading={feed.loading}
        empty={feed.rows.length === 0}
        missingAnchor={feed.missingAnchor}
        words={feed.settled}
        retry={feed.refresh}
      />
      {feed.newer ? (
        <Button
          label="Newer lines"
          icon="arrowUp"
          variant="text"
          loading={feed.loadingNewer}
          onPress={feed.loadNewer}
        />
      ) : null}
    </>
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
        <FeedStatus feed={feed} />
      </View>
    </View>
  );
}

function FeedViewport({ feed, timeZone, remove, ...props }: TranscriptFeedProps): ReactNode {
  const { listRef, layout, jump, top, scroll, retryJump, anchorReady } = useFeedScroll(
    feed.rows,
    feed.anchor,
    props.focus === true,
  );
  return (
    <FlatList<TranscriptHit>
      ref={listRef}
      className="flex-1"
      contentContainerClassName="pb-section-gap"
      data={feed.rows}
      keyExtractor={(hit) => String(hit.line.id)}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={50}
      maxToRenderPerBatch={10}
      windowSize={5}
      maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
      ListHeaderComponent={
        <FeedHeader {...props} feed={feed} timeZone={timeZone} layout={layout} top={top} />
      }
      ListFooterComponent={feed.rows.length === 0 ? null : <Paging feed={feed} />}
      onScroll={scroll}
      scrollEventThrottle={16}
      onContentSizeChange={jump}
      onScrollToIndexFailed={retryJump}
      onEndReached={() => {
        if (feed.older && !feed.fetching) feed.loadOlder();
      }}
      onEndReachedThreshold={0.3}
      renderItem={({ item }) => (
        <TranscriptRow
          hit={item}
          timeZone={timeZone}
          highlighted={feed.anchor === item.line.id}
          ready={feed.anchor === item.line.id ? anchorReady : undefined}
          open={
            feed.settled === '' || feed.context
              ? undefined
              : (): void => {
                  feed.open(item.line.id);
                }
          }
          remove={remove}
        />
      )}
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
