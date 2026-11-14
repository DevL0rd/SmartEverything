import {
  API_ENDPOINTS as E,
  DRIVE_ALBUM_CHANGE,
  DRIVE_ALBUM_CREATE,
  DRIVE_CONFLICT_RESOLUTIONS,
  DRIVE_EDIT_ACTIONS,
  DRIVE_GRANT_ROLES,
  DRIVE_PLACEMENT_SET,
  DRIVE_ROOT_CHANGE,
  DRIVE_SHARE_CREATE,
  PHOTO_SOURCES,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { attachToChat } from './drive-attach';
import { DRIVE_FIELDS, PERSON, ownDrive } from './drive-reads';
import { ToolError, WRITES } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

const ITEM_IDS = z.array(z.uuid()).min(1);
const NAME = z.string().trim().min(1);

export const DRIVE_EDIT_INPUT = z.strictObject({
  action: z.enum(DRIVE_EDIT_ACTIONS).describe('What to change'),
  personId: PERSON,
  rootId: DRIVE_FIELDS.rootId.optional().describe('A drive id from drive_read view drives'),
  driveChanges: DRIVE_ROOT_CHANGE.optional().describe(
    'The drive settings to change, for action configure',
  ),
  parentId: DRIVE_FIELDS.folderId
    .optional()
    .describe(
      'The folder to make a folder in; leave it out and give rootId for the top of a drive',
    ),
  name: NAME.optional().describe('The new name for new_folder and rename'),
  itemId: DRIVE_FIELDS.itemId.optional().describe('One file or folder id from drive_read'),
  itemIds: ITEM_IDS.optional().describe('File and folder ids from drive_read'),
  toFolderId: DRIVE_FIELDS.folderId.optional().describe('The folder to move or copy into'),
  starred: z
    .boolean()
    .optional()
    .describe('false removes the star, for action star; true when left out'),
  albumId: DRIVE_FIELDS.albumId.optional().describe('An album id from drive_read view albums'),
  album: DRIVE_ALBUM_CREATE.optional().describe('The new album, for action album_create'),
  changes: DRIVE_ALBUM_CHANGE.optional().describe('The album fields to change, for album_update'),
  source: z.enum(PHOTO_SOURCES).optional().describe('cameras or ai, for action keep'),
  versionId: z.uuid().optional().describe('A version id from drive_read view versions'),
  share: DRIVE_SHARE_CREATE.optional().describe('The link to make, for action share_create'),
  shareId: z.uuid().optional().describe('A share id from drive_read view shares'),
  conflictId: z.uuid().optional().describe('A conflict id from drive_read view conflicts'),
  resolution: z.enum(DRIVE_CONFLICT_RESOLUTIONS).optional().describe('Which copy to keep'),
  recipientId: z.uuid().optional().describe('The person to share with, for action share_people'),
  role: z
    .enum([...DRIVE_GRANT_ROLES, 'none'])
    .optional()
    .describe('view or edit to share with that person, none to stop sharing, for share_people'),
  placement: DRIVE_PLACEMENT_SET.optional().describe(
    'The folder placement on one of your computers, for action placement_set',
  ),
  placementId: z.uuid().optional().describe('A placement id from drive_read view placements'),
});

function change(name: string, shape: z.ZodRawShape): Selection {
  return selection({
    input: z.strictObject(shape),
    run: (context, input, as) =>
      operate(context, 'changeDrive', { body: { action: name, ...input } }, as),
  });
}

function newFolder(): Selection {
  return selection({
    input: z.union([
      z.strictObject({ parentId: DRIVE_FIELDS.folderId, name: NAME }),
      z.strictObject({ rootId: DRIVE_FIELDS.rootId, name: NAME }),
    ]),
    run: (context, input, as) =>
      operate(
        context,
        'changeDrive',
        {
          body: {
            action: 'new_folder',
            parent:
              'parentId' in input
                ? { kind: 'folder', folderId: input.parentId }
                : { kind: 'drive', rootId: input.rootId },
            name: input.name,
          },
        },
        as,
      ),
  });
}

function star(): Selection {
  return selection({
    input: z.strictObject({ itemIds: ITEM_IDS, starred: z.boolean().default(true) }),
    run: (context, input, as) =>
      operate(
        context,
        'changeDrive',
        { body: { action: input.starred ? 'star' : 'unstar', itemIds: input.itemIds } },
        as,
      ),
  });
}

function bodied(name: 'createAlbum' | 'setPlacement', key: string, field: z.ZodType): Selection {
  return selection({
    input: z.strictObject({ [key]: field }),
    run: (context, input, as) => operate(context, name, { body: input[key] }, as),
  });
}

function driveUpdate(): Selection {
  return selection({
    input: z.strictObject({ rootId: DRIVE_FIELDS.rootId, driveChanges: DRIVE_ROOT_CHANGE }),
    run: (context, input, as) =>
      operate(
        context,
        'updateRoot',
        { params: { rootId: input.rootId }, body: input.driveChanges },
        as,
      ),
  });
}

function sharePeople(): Selection {
  return selection({
    input: z.strictObject({
      itemId: DRIVE_FIELDS.itemId,
      recipientId: z.uuid(),
      role: z.enum([...DRIVE_GRANT_ROLES, 'none']),
    }),
    run: async (context, { itemId, recipientId, role }, as) => {
      if (role !== 'none') {
        return operate(context, 'setGrant', { body: { itemId, profileId: recipientId, role } }, as);
      }
      const grants = E.listGrants.response.parse(
        await operate(context, 'listGrants', { params: { itemId } }, as),
      );
      const grant = grants.find((entry) => entry.profileId === recipientId);
      if (grant === undefined) {
        throw new ToolError('This item is not shared with that person.');
      }
      return operate(context, 'removeGrant', { params: { grantId: grant.id } }, as);
    },
  });
}

function placementRemove(): Selection {
  return selection({
    input: z.strictObject({ placementId: z.uuid() }),
    run: (context, input, as) =>
      operate(context, 'removePlacement', { params: { placementId: input.placementId } }, as),
  });
}

function scan(): Selection {
  return selection({
    input: z.strictObject({ rootId: DRIVE_FIELDS.rootId }),
    run: (context, input, as) =>
      operate(context, 'scanRoot', { params: { rootId: input.rootId } }, as),
  });
}

function albumUpdate(): Selection {
  return selection({
    input: z.strictObject({ albumId: DRIVE_FIELDS.albumId, changes: DRIVE_ALBUM_CHANGE }),
    run: (context, input, as) =>
      operate(
        context,
        'updateAlbum',
        { params: { albumId: input.albumId }, body: input.changes },
        as,
      ),
  });
}

function keep(): Selection {
  return selection({
    input: z.strictObject({ source: z.enum(PHOTO_SOURCES), itemIds: ITEM_IDS }),
    run: (context, { source, itemIds }, as) =>
      operate(context, 'keepSourceItems', { params: { source }, body: { itemIds } }, as),
  });
}

function versionRestore(): Selection {
  return selection({
    input: z.strictObject({ itemId: DRIVE_FIELDS.itemId, versionId: z.uuid() }),
    run: (context, input, as) => operate(context, 'restoreVersion', { params: input }, as),
  });
}

function shareCreate(): Selection {
  return selection({
    input: z.strictObject({ share: DRIVE_SHARE_CREATE }),
    run: async (context, input, as) => {
      const created = E.createShare.response.parse(
        await operate(context, 'createShare', { body: input.share }, as),
      );
      return {
        ...created,
        expiresAt: created.share.expiresAt,
        revoke: { tool: 'drive_edit', action: 'share_revoke', shareId: created.share.id },
      };
    },
  });
}

function shareRevoke(): Selection {
  return selection({
    input: z.strictObject({ shareId: z.uuid() }),
    run: (context, input, as) =>
      operate(context, 'revokeShare', { params: { shareId: input.shareId } }, as),
  });
}

function conflictResolve(): Selection {
  return selection({
    input: z.strictObject({
      conflictId: z.uuid(),
      resolution: z.enum(DRIVE_CONFLICT_RESOLUTIONS),
    }),
    run: (context, input, as) => operate(context, 'resolveConflict', { body: input }, as),
  });
}

function scrubStart(): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => operate(context, 'startScrub', {}, as),
  });
}

export const DRIVE_EDIT: SelectedToolDefinition = {
  name: 'drive_edit',
  selector: 'action',
  input: DRIVE_EDIT_INPUT,
  annotations: WRITES,
  action: true,
  selections: ownDrive({
    configure: driveUpdate(),
    scan: scan(),
    new_folder: newFolder(),
    rename: change('rename', { itemId: DRIVE_FIELDS.itemId, name: NAME }),
    move: change('move', { itemIds: ITEM_IDS, toFolderId: DRIVE_FIELDS.folderId }),
    copy: change('copy', { itemIds: ITEM_IDS, toFolderId: DRIVE_FIELDS.folderId }),
    star: star(),
    trash: change('trash', { itemIds: ITEM_IDS }),
    restore: change('restore', { itemIds: ITEM_IDS }),
    album_create: bodied('createAlbum', 'album', DRIVE_ALBUM_CREATE),
    album_update: albumUpdate(),
    album_add: change('album_add', { albumId: DRIVE_FIELDS.albumId, itemIds: ITEM_IDS }),
    album_remove: change('album_remove', { albumId: DRIVE_FIELDS.albumId, itemIds: ITEM_IDS }),
    keep: keep(),
    attach_to_chat: attachToChat(),
    version_restore: versionRestore(),
    share_create: shareCreate(),
    share_revoke: shareRevoke(),
    share_people: sharePeople(),
    conflict_resolve: conflictResolve(),
    placement_set: bodied('setPlacement', 'placement', DRIVE_PLACEMENT_SET),
    placement_remove: placementRemove(),
    scrub_start: scrubStart(),
  }),
};
