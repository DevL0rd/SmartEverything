import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { DriveComment, DriveCommentThread } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { removeDriveComment, resolveDriveComment } from '../../../api/drive';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ProfileAvatar } from '../../profiles';
import { useShownWriter } from '../../../queries/shown-writer';
import { Composer } from './comment-composer';
import type { CommentContext } from './comment-context';
import { addComment, editComment, removeTargets, resolveTargets } from './comment-writes';
import {
  DELETED_COMMENT,
  bodyPartsOf,
  commentRightsOf,
  mayResolve,
  resolvedByLineOf,
  stampOf,
} from './comments-model';

const log = new Logger('app.drive');

const NO_SETTLE = (): void => undefined;

function Body({
  comment,
  context,
}: {
  readonly comment: DriveComment;
  readonly context: CommentContext;
}): ReactNode {
  if (comment.body === null) {
    return (
      <Text variant="callout" tone="variant">
        {DELETED_COMMENT}
      </Text>
    );
  }
  return (
    <Text variant="callout" selectable>
      {bodyPartsOf(comment.body, context.people).map((part, index) =>
        part.mention === null ? (
          part.text
        ) : (
          <Text key={String(index)} variant="callout" tone="primary" className="font-sans-medium">
            {part.text}
          </Text>
        ),
      )}
    </Text>
  );
}

function useCommentMenu(
  comment: DriveComment,
  context: CommentContext,
  onEdit: () => void,
): readonly MenuItem[] {
  const { write } = useShownWriter(NO_SETTLE);
  const rights = commentRightsOf(comment, context.viewerId, context.moderator);
  if (!context.writable) return [];
  const removeItem: MenuItem = {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
    destructive: true,
    onPress: () => {
      confirm({
        title: 'Delete this comment?',
        body: 'It cannot be brought back. Replies stay in the thread.',
        confirmLabel: 'Delete',
        tone: 'destructive',
      }).then(
        (accepted) => {
          if (!accepted) return;
          write({
            event: 'drive.comment.remove',
            targets: removeTargets(comment),
            send: () => removeDriveComment(comment.id),
            failure: 'The comment was not deleted',
          });
        },
        (error: unknown) => {
          log.error('comments.confirm_failed', error);
        },
      );
    },
  };
  return [
    ...(rights.edit
      ? [{ id: 'edit', label: 'Edit', icon: 'pencil', onPress: onEdit } as const]
      : []),
    ...(rights.remove ? [removeItem] : []),
  ];
}

function Author({
  comment,
  context,
  menu,
}: {
  readonly comment: DriveComment;
  readonly context: CommentContext;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  const name = context.nameOf(comment.authorProfileId) ?? 'Someone';
  return (
    <View className="min-h-8 flex-row items-center gap-2">
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1} className="font-sans-medium">
          {comment.authorProfileId === context.viewerId ? `${name} (you)` : name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {stampOf(comment, context.now)}
        </Text>
      </View>
      {menu.length === 0 ? null : (
        <OverflowButton items={menu} label={`Actions for the comment by ${name}`} />
      )}
    </View>
  );
}

function Avatar({
  profileId,
  context,
}: {
  readonly profileId: string;
  readonly context: CommentContext;
}): ReactNode {
  const author = context.people.find((person) => person.id === profileId);
  if (author === undefined) return <View className="size-8 rounded-full bg-surface-3" />;
  return <ProfileAvatar profile={author} />;
}

function CommentView({
  comment,
  context,
  reply,
}: {
  readonly comment: DriveComment;
  readonly context: CommentContext;
  readonly reply: boolean;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const client = useQueryClient();
  const stop = (): void => {
    setEditing(false);
  };
  const menu = useCommentMenu(comment, context, () => {
    setEditing(true);
  });
  return (
    <View className={cn('flex-row gap-3', reply ? 'pl-11' : '')}>
      <Avatar profileId={comment.authorProfileId} context={context} />
      <View className="min-w-0 flex-1 gap-1">
        <Author comment={comment} context={context} menu={menu} />
        {editing ? (
          <Composer
            context={context}
            label="Edit comment"
            placeholder="Change the comment"
            submitLabel="Save"
            initial={comment.body ?? ''}
            focus
            send={(body, mentions) => editComment(client, comment, { body, mentions })}
            onCancel={stop}
            onDone={stop}
          />
        ) : (
          <Body comment={comment} context={context} />
        )}
      </View>
    </View>
  );
}

function footLineOf(thread: DriveCommentThread, context: CommentContext): string | null {
  const resolved = resolvedByLineOf(thread, context.nameOf, context.now);
  if (resolved !== null) return resolved;
  return thread.replies.length === 0 ? 'No replies yet' : null;
}

function ThreadFooter({
  thread,
  context,
  onReply,
}: {
  readonly thread: DriveCommentThread;
  readonly context: CommentContext;
  readonly onReply: () => void;
}): ReactNode {
  const resolve = useShownWriter(NO_SETTLE);
  const resolved = thread.root.resolvedAt !== null;
  const resolvable = context.writable && mayResolve(thread, context.viewerId, context.moderator);
  const line = footLineOf(thread, context);
  return (
    <View className="gap-1 border-t border-outline-variant pt-2">
      <View className="flex-row items-center gap-2">
        <Text variant="caption" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
          {line}
        </Text>
        <View className="flex-row items-center gap-2">
          {context.writable && !resolved ? (
            <Button label="Reply" variant="text" onPress={onReply} />
          ) : null}
          {resolvable ? (
            <ResolveButton
              resolved={resolved}
              busy={resolve.busy}
              onPress={() => {
                resolve.write({
                  event: 'drive.comment.resolve',
                  targets: resolveTargets(thread.root, !resolved, context.viewerId),
                  send: () => resolveDriveComment(thread.root.id, !resolved),
                  failure: 'The thread was not changed',
                });
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ResolveButton({
  resolved,
  busy,
  onPress,
}: {
  readonly resolved: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
}): ReactNode {
  if (resolved) {
    return (
      <Button label="Reopen" icon="undo" variant="outlined" disabled={busy} onPress={onPress} />
    );
  }
  return <Button label="Resolve" icon="check" variant="tonal" disabled={busy} onPress={onPress} />;
}

function ReplyComposer({
  thread,
  context,
  onDone,
}: {
  readonly thread: DriveCommentThread;
  readonly context: CommentContext;
  readonly onDone: () => void;
}): ReactNode {
  const client = useQueryClient();
  return (
    <View className="pl-11">
      <Composer
        context={context}
        label="Reply"
        placeholder="Reply, or type @ to mention someone"
        submitLabel="Reply"
        initial=""
        focus
        send={(body, mentions) =>
          addComment(client, context.viewerId, context.subject.item.id, {
            body,
            parentId: thread.root.id,
            mentions,
          })
        }
        onCancel={onDone}
        onDone={onDone}
      />
    </View>
  );
}

export function ThreadCard({
  thread,
  context,
}: {
  readonly thread: DriveCommentThread;
  readonly context: CommentContext;
}): ReactNode {
  const [replying, setReplying] = useState(false);
  const stop = (): void => {
    setReplying(false);
  };
  return (
    <View
      role="listitem"
      className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-3"
    >
      <CommentView comment={thread.root} context={context} reply={false} />
      {thread.replies.map((reply) => (
        <CommentView key={reply.id} comment={reply} context={context} reply />
      ))}
      {replying ? (
        <ReplyComposer thread={thread} context={context} onDone={stop} />
      ) : (
        <ThreadFooter
          thread={thread}
          context={context}
          onReply={() => {
            setReplying(true);
          }}
        />
      )}
    </View>
  );
}
