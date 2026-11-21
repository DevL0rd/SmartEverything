import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DriveCommentThread } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { Disclosure } from '../../../components/disclosure';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useScreenPaused } from '../../../design/screen-pause';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveComments } from '../data';
import type { DetailsSubject } from '../details/details-model';
import { ThreadCard } from './comment-card';
import { Composer } from './comment-composer';
import { useCommentContext, type CommentContext } from './comment-context';
import { addComment } from './comment-writes';
import { openLabelOf, resolvedLabelOf, threadGroupsOf } from './comments-model';

type CommentPages = ReturnType<typeof useDriveComments>;

const SKELETON_ROWS = ['a', 'b'] as const;

function useWholeThreadList(pages: CommentPages): void {
  const paused = useScreenPaused();
  const due = !paused && pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError;
  const { fetchNextPage } = pages;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'drive.comments.page_failed');
  }, [due, fetchNextPage]);
}

function Threads({
  threads,
  context,
}: {
  readonly threads: readonly DriveCommentThread[];
  readonly context: CommentContext;
}): ReactNode {
  const [showResolved, setShowResolved] = useState(false);
  const groups = threadGroupsOf(threads);
  return (
    <View className="gap-3">
      <Text variant="label" tone="variant" className="tabular">
        {openLabelOf(groups.open.length)}
      </Text>
      {groups.open.length === 0 ? null : (
        <View role="list" className="gap-3">
          {groups.open.map((thread) => (
            <ThreadCard key={thread.root.id} thread={thread} context={context} />
          ))}
        </View>
      )}
      {groups.resolved.length === 0 ? null : (
        <Disclosure
          label={resolvedLabelOf(groups.resolved.length)}
          open={showResolved}
          onToggle={() => {
            setShowResolved(!showResolved);
          }}
          bodyClassName="gap-3 pt-1"
        >
          {groups.resolved.map((thread) => (
            <ThreadCard key={thread.root.id} thread={thread} context={context} />
          ))}
        </Disclosure>
      )}
    </View>
  );
}

function Unloaded({ pages }: { readonly pages: CommentPages }): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        compact
        icon="wifiOff"
        title="The hub is offline"
        body="Comments come back when the hub reconnects."
      />
    );
  }
  if (pages.isError) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'drive.comments.retry_failed');
        }}
      />
    );
  }
  return (
    <View aria-busy accessibilityLabel="Loading comments" className="gap-3">
      {SKELETON_ROWS.map((key) => (
        <Skeleton key={key} shape="block" className="h-28" />
      ))}
    </View>
  );
}

function NewThread({ context }: { readonly context: CommentContext }): ReactNode {
  const client = useQueryClient();
  if (!context.writable) return null;
  return (
    <Composer
      context={context}
      label="New comment"
      placeholder="Add a comment, or type @ to mention someone"
      submitLabel="Comment"
      initial=""
      focus={false}
      send={(body, mentions) =>
        addComment(client, context.viewerId, context.subject.item.id, {
          body,
          parentId: null,
          mentions,
        })
      }
      onCancel={null}
      onDone={() => undefined}
    />
  );
}

export function CommentsTab({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const pages = useDriveComments(subject.item.id);
  const context = useCommentContext(subject);
  useWholeThreadList(pages);
  if (pages.data === undefined) return <Unloaded pages={pages} />;
  const threads = flattenPages(pages.data, (page) => page.items);
  return (
    <View className="gap-4">
      <NewThread context={context} />
      {threads.length === 0 ? (
        <EmptyState
          compact
          icon="messageCircle"
          title="No comments yet"
          body={
            context.writable
              ? 'Ask a question or leave a note. Type @ to tell someone about it.'
              : 'Comments people leave on this item show here.'
          }
        />
      ) : (
        <Threads threads={threads} context={context} />
      )}
    </View>
  );
}
