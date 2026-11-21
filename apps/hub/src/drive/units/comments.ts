import {
  ApiError,
  type DriveComment,
  type DriveCommentAdd,
  type DriveCommentEdit,
  type DriveItem,
  type DriveNotificationKind,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { DriveCommentParentError } from '../../store/repositories/drive-comments';
import type { Store } from '../../store/store';
import { canRead, itemAccess, type DriveActor, type ItemAccess } from '../access';
import { storeUnit } from '../../store/host/unit';
import { DriveReadRules } from './read';
import { DRIVE_PAGE_SIZE } from '../page-size';
import type { CommentPage } from '../social/comments';
import { peopleWithAccess, type AudienceStore } from '../social/audience';
import { checkMentions } from '../social/mentions';

const log = new Logger('hub.drive');

type CommentStore = AudienceStore & Pick<Store, 'driveComments' | 'driveNotifications'>;

interface CommentsEnv {
  readonly store: CommentStore;
  readonly read: DriveReadRules;
}

function missingComment(): ApiError {
  return new ApiError('not_found', 'There is no such comment.');
}

function moderates(access: ItemAccess): boolean {
  return access === 'own' || access === 'shared';
}

class CommentRules {
  constructor(private readonly env: CommentsEnv) {}

  list(actor: DriveActor, itemId: string, cursor: string | undefined): CommentPage {
    this.env.read.readItem(actor, itemId);
    const { threads, next } = this.env.store.driveComments.threads(
      itemId,
      cursor ?? null,
      DRIVE_PAGE_SIZE,
    );
    return { items: threads, next };
  }

  add(actor: DriveActor, itemId: string, input: DriveCommentAdd): DriveComment {
    const made = this.alreadyMade(actor, itemId, input.id);
    if (made !== undefined) return made;
    const item = this.env.read.readItem(actor, itemId);
    const mentions = checkMentions(this.env.store, item, input.mentions);
    const comment = this.attach(item, actor, input, mentions);
    this.notifyAdded(item, comment, mentions);
    return comment;
  }

  edit(actor: DriveActor, commentId: string, input: DriveCommentEdit): DriveComment {
    const { comment, item } = this.opened(actor, commentId);
    if (comment.deleted) throw missingComment();
    if (comment.authorProfileId !== actor.profileId) {
      throw new ApiError('forbidden', 'Only the author can change a comment.');
    }
    const mentions = checkMentions(this.env.store, item, input.mentions);
    const edited = this.env.store.driveComments.edit(commentId, input.body, mentions);
    this.notify(
      item,
      edited,
      mentions.filter((profileId) => !comment.mentions.includes(profileId)),
      'mentioned',
    );
    return edited;
  }

  resolve(actor: DriveActor, commentId: string, resolved: boolean): DriveComment {
    const { comment, access } = this.opened(actor, commentId);
    if (comment.parentId !== null) {
      throw new ApiError('invalid_request', 'Only the first comment of a thread can be resolved.');
    }
    if (!moderates(access) && comment.authorProfileId !== actor.profileId) {
      throw new ApiError(
        'forbidden',
        'Only the owner of the file or the person who started the thread can resolve it.',
      );
    }
    return this.env.store.driveComments.resolve(commentId, resolved ? actor.profileId : null);
  }

  remove(actor: DriveActor, commentId: string): void {
    const { comment, access } = this.opened(actor, commentId);
    if (comment.deleted) throw missingComment();
    if (!moderates(access) && comment.authorProfileId !== actor.profileId) {
      throw new ApiError(
        'forbidden',
        'Only the author or the owner of the file can delete a comment.',
      );
    }
    this.env.store.driveComments.remove(commentId);
  }

  private alreadyMade(
    actor: DriveActor,
    itemId: string,
    id: string | undefined,
  ): DriveComment | undefined {
    const made = id === undefined ? undefined : this.env.store.driveComments.find(id);
    if (made === undefined) return undefined;
    if (made.itemId !== itemId || made.authorProfileId !== actor.profileId) {
      throw new ApiError('forbidden', 'That comment belongs to someone else.');
    }
    log.debug('drive_comment.duplicate_add_ignored', { commentId: made.id, itemId });
    return made;
  }

  private opened(
    actor: DriveActor,
    commentId: string,
  ): { readonly comment: DriveComment; readonly item: DriveItem; readonly access: ItemAccess } {
    const { store } = this.env;
    const comment = store.driveComments.find(commentId);
    const item =
      comment === undefined ? undefined : store.driveItems.find(comment.itemId, actor.profileId);
    if (comment === undefined || item === undefined) throw missingComment();
    const access = itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
    if (!canRead(access)) throw missingComment();
    return { comment, item, access };
  }

  private attach(
    item: DriveItem,
    actor: DriveActor,
    input: DriveCommentAdd,
    mentions: readonly string[],
  ): DriveComment {
    try {
      return this.env.store.driveComments.add({
        id: input.id,
        itemId: item.id,
        authorProfileId: actor.profileId,
        parentId: input.parentId,
        body: input.body,
        mentions,
      });
    } catch (cause) {
      if (cause instanceof DriveCommentParentError) {
        throw new ApiError(
          'invalid_request',
          'Reply to the first comment of a thread on this item.',
        );
      }
      throw cause;
    }
  }

  private notifyAdded(item: DriveItem, comment: DriveComment, mentions: readonly string[]): void {
    const told = new Set<string>(mentions);
    this.notify(item, comment, mentions, 'mentioned');
    if (comment.parentId === null) {
      const watchers = peopleWithAccess(this.env.store, item)
        .filter((person) => person.access === 'own' || person.access === 'edit')
        .map((person) => person.profileId)
        .filter((profileId) => !told.has(profileId));
      this.notify(item, comment, watchers, 'commented');
      return;
    }
    const participants = this.env.store.driveComments
      .participants(comment.parentId)
      .filter((profileId) => !told.has(profileId));
    this.notify(item, comment, participants, 'replied');
  }

  private notify(
    item: DriveItem,
    comment: DriveComment,
    recipients: readonly string[],
    kind: DriveNotificationKind,
  ): void {
    const reachable = new Set(
      peopleWithAccess(this.env.store, item).map((person) => person.profileId),
    );
    for (const profileId of recipients) {
      if (profileId === comment.authorProfileId || !reachable.has(profileId)) continue;
      this.env.store.driveNotifications.add({
        profileId,
        kind,
        itemId: item.id,
        actorProfileId: comment.authorProfileId,
        actorName: null,
        refId: comment.id,
      });
    }
  }
}

function rules(store: Store): CommentRules {
  return new CommentRules({ store, read: new DriveReadRules(store) });
}

export const DRIVE_COMMENTS_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly itemId: string;
      readonly cursor: string | undefined;
    },
  ) => rules(store).list(input.actor, input.itemId, input.cursor),
);

export const DRIVE_COMMENT_ADD_UNIT = storeUnit(
  (
    store,
    input: { readonly actor: DriveActor; readonly itemId: string; readonly add: DriveCommentAdd },
  ) => rules(store).add(input.actor, input.itemId, input.add),
);

export const DRIVE_COMMENT_EDIT_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly commentId: string;
      readonly edit: DriveCommentEdit;
    },
  ) => rules(store).edit(input.actor, input.commentId, input.edit),
);

export const DRIVE_COMMENT_RESOLVE_UNIT = storeUnit(
  (
    store,
    input: { readonly actor: DriveActor; readonly commentId: string; readonly resolved: boolean },
  ) => rules(store).resolve(input.actor, input.commentId, input.resolved),
);

export const DRIVE_COMMENT_REMOVE_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly commentId: string }) => {
    rules(store).remove(input.actor, input.commentId);
  },
);
