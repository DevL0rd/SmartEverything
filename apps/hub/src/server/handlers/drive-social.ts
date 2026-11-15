import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveComments } from '../../drive/social/comments';
import type { DriveFolderColours } from '../../drive/social/folder-colours';
import type { DriveInbox } from '../../drive/social/notifications';
import type { DriveShortcuts } from '../../drive/social/shortcuts';
import type { DriveSuggestions } from '../../drive/social/suggestions';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf, callerOf } from './drive-services';

export interface DriveSocialServices {
  readonly comments: DriveComments;
  readonly inbox: DriveInbox;
  readonly shortcuts: DriveShortcuts;
  readonly suggestions: DriveSuggestions;
  readonly colours: DriveFolderColours;
}

type DriveCommentRoute =
  'listComments' | 'addComment' | 'editComment' | 'resolveComment' | 'removeComment';

type DriveSocialRoute =
  | 'listNotifications'
  | 'markNotificationsRead'
  | 'createShortcut'
  | 'updateShortcut'
  | 'removeShortcut'
  | 'listSuggested'
  | 'setFolderColour';

function driveCommentRoutes(store: Store, comments: DriveComments): Routes<DriveCommentRoute> {
  return {
    listComments: bound(E.listComments, ({ params, query, caller }) =>
      refusing(() => comments.list(actorOf(store, caller), params.itemId, query.cursor)),
    ),
    addComment: bound(E.addComment, ({ params, body, caller }) =>
      refusing(() => comments.add(actorOf(store, caller), params.itemId, body)),
    ),
    editComment: bound(E.editComment, ({ params, body, caller }) =>
      refusing(() => comments.edit(actorOf(store, caller), params.commentId, body)),
    ),
    resolveComment: bound(E.resolveComment, ({ params, body, caller }) =>
      refusing(() => comments.resolve(actorOf(store, caller), params.commentId, body.resolved)),
    ),
    removeComment: bound(E.removeComment, ({ params, caller }) =>
      refusing(() => {
        comments.remove(actorOf(store, caller), params.commentId);
        return DONE_REPLY;
      }),
    ),
  };
}

export function driveSocialRoutes(
  store: Store,
  social: DriveSocialServices,
): Routes<DriveSocialRoute | DriveCommentRoute> {
  return {
    ...driveCommentRoutes(store, social.comments),
    listNotifications: bound(E.listNotifications, ({ query, caller }) =>
      refusing(() => social.inbox.list(actorOf(store, caller), query.cursor)),
    ),
    markNotificationsRead: bound(E.markNotificationsRead, ({ body, caller }) =>
      refusing(() => {
        social.inbox.markRead(actorOf(store, caller), body);
        return DONE_REPLY;
      }),
    ),
    createShortcut: bound(E.createShortcut, ({ body, caller }) =>
      refusing(() => social.shortcuts.create(callerOf(store, caller), body)),
    ),
    updateShortcut: bound(E.updateShortcut, ({ params, body, caller }) =>
      refusing(() => social.shortcuts.update(actorOf(store, caller), params.shortcutId, body)),
    ),
    removeShortcut: bound(E.removeShortcut, ({ params, caller }) =>
      refusing(() => {
        social.shortcuts.remove(actorOf(store, caller), params.shortcutId);
        return DONE_REPLY;
      }),
    ),
    listSuggested: bound(E.listSuggested, ({ query, caller }) =>
      refusing(() => social.suggestions.list(actorOf(store, caller), query.cursor)),
    ),
    setFolderColour: bound(E.setFolderColour, ({ body, caller }) =>
      refusing(() => social.colours.set(actorOf(store, caller), body)),
    ),
  };
}
