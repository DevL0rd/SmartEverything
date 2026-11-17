import { PARTNER_SCOPES } from '@smarteverything/domain';
import { z } from 'zod';
import { operate, type ActingAs, type OperatingContext } from './acting';
import { PHOTO_MEDIA_EDITS } from './drive-photos-media-edits';
import { ID, ITEM_IDS, MEMBER_ROLES, PHOTO_EDIT_FIELDS, TEXT } from './drive-photos-fields';
import { selection, type Selection } from './selected-tool';

function personUpdate(): Selection {
  return selection({
    input: z
      .strictObject({
        groupId: ID,
        personName: PHOTO_EDIT_FIELDS.personName,
        linkedProfileId: PHOTO_EDIT_FIELDS.linkedProfileId,
        hidden: PHOTO_EDIT_FIELDS.hidden,
      })
      .refine((input) => Object.values(input).filter((value) => value !== undefined).length > 1, {
        message: 'name at least one thing to change: personName, linkedProfileId or hidden',
        path: ['personName'],
      }),
    run: (context, { groupId, personName, linkedProfileId, hidden }, as) =>
      operate(
        context,
        'updatePhotoGroup',
        {
          params: { groupId },
          body: {
            ...(personName === undefined ? {} : { name: personName }),
            ...(linkedProfileId === undefined ? {} : { linkedProfileId }),
            ...(hidden === undefined ? {} : { hidden }),
          },
        },
        as,
      ),
  });
}

function personMerge(): Selection {
  return selection({
    input: z.strictObject({ groupId: ID, sourceGroupIds: z.array(ID).min(1) }),
    run: (context, input, as) =>
      operate(
        context,
        'mergePhotoGroups',
        { body: { targetId: input.groupId, sourceIds: input.sourceGroupIds } },
        as,
      ),
  });
}

function personDismissMerge(): Selection {
  return selection({
    input: z.strictObject({ groupId: ID, otherGroupId: ID }),
    run: (context, input, as) =>
      operate(
        context,
        'dismissPhotoMergeSuggestion',
        { body: { groupIds: [input.groupId, input.otherGroupId] } },
        as,
      ),
  });
}

function personRemoveFaces(): Selection {
  return selection({
    input: z.strictObject({ groupId: ID, faceIds: z.array(ID).min(1) }),
    run: (context, { groupId, faceIds }, as) =>
      operate(context, 'removePhotoGroupFaces', { params: { groupId }, body: { faceIds } }, as),
  });
}

async function albumMembers(
  context: OperatingContext,
  albumId: string,
  members: readonly { readonly profileId: string; readonly role: string }[],
  as: ActingAs,
): Promise<unknown> {
  const adding = members.filter((member) => member.role !== 'none');
  const removing = members.filter((member) => member.role === 'none');
  const set =
    adding.length === 0
      ? []
      : await operate(
          context,
          'setPhotoAlbumMembers',
          { params: { albumId }, body: { members: adding } },
          as,
        );
  for (const member of removing) {
    await operate(
      context,
      'removePhotoAlbumMember',
      { params: { albumId, profileId: member.profileId } },
      as,
    );
  }
  return { members: set, removed: removing.map((member) => member.profileId) };
}

function albumMembersSelection(): Selection {
  return selection({
    input: z.strictObject({
      albumId: ID,
      members: z.array(z.strictObject({ profileId: ID, role: MEMBER_ROLES })).min(1),
    }),
    run: (context, input, as) => albumMembers(context, input.albumId, input.members, as),
  });
}

function albumMembership(name: 'joinPhotoAlbum' | 'leavePhotoAlbum'): Selection {
  return selection({
    input: z.strictObject({ albumId: ID }),
    run: (context, input, as) => operate(context, name, { params: { albumId: input.albumId } }, as),
  });
}

function albumComment(): Selection {
  return selection({
    input: z.strictObject({ albumId: ID, body: TEXT, itemId: ID.optional() }),
    run: (context, { albumId, body, itemId }, as) =>
      operate(
        context,
        'addPhotoAlbumActivity',
        {
          params: { albumId },
          body: { kind: 'comment', text: body, ...(itemId === undefined ? {} : { itemId }) },
        },
        as,
      ),
  });
}

function albumLike(): Selection {
  return selection({
    input: z.strictObject({ albumId: ID, itemId: ID.optional() }),
    run: (context, { albumId, itemId }, as) =>
      operate(
        context,
        'addPhotoAlbumActivity',
        {
          params: { albumId },
          body: { kind: 'like', ...(itemId === undefined ? {} : { itemId }) },
        },
        as,
      ),
  });
}

function albumActivityDelete(): Selection {
  return selection({
    input: z.strictObject({ albumId: ID, activityId: ID }),
    run: (context, params, as) => operate(context, 'removePhotoAlbumActivity', { params }, as),
  });
}

function partnerSet(): Selection {
  return selection({
    input: z.strictObject({
      recipientId: ID,
      scope: z.enum(PARTNER_SCOPES),
      groupIds: z.array(ID).default([]),
      fromDay: z.iso.date(),
    }),
    run: (context, input, as) => operate(context, 'setPhotoPartner', { body: input }, as),
  });
}

function partnerAnswer(name: 'acceptPhotoPartner' | 'stopPhotoPartner'): Selection {
  return selection({
    input: z.strictObject({ shareId: ID }),
    run: (context, input, as) => operate(context, name, { params: { shareId: input.shareId } }, as),
  });
}

function partnerSave(): Selection {
  return selection({
    input: z.union([
      z.strictObject({ shareId: ID, itemIds: ITEM_IDS }),
      z.strictObject({ shareId: ID, autoSave: z.boolean() }),
    ]),
    run: (context, input, as) =>
      'itemIds' in input
        ? operate(
            context,
            'savePartnerPhotos',
            { params: { shareId: input.shareId }, body: { itemIds: input.itemIds } },
            as,
          )
        : operate(
            context,
            'setPartnerAutoSave',
            { params: { shareId: input.shareId }, body: { autoSave: input.autoSave } },
            as,
          ),
  });
}

function smartSettings(): Selection {
  return selection({
    input: z
      .strictObject({
        smartSearch: z.boolean().optional(),
        faceGrouping: z.boolean().optional(),
      })
      .refine((input) => input.smartSearch !== undefined || input.faceGrouping !== undefined, {
        message: 'name smartSearch, faceGrouping or both',
        path: ['smartSearch'],
      }),
    run: (context, input, as) => operate(context, 'setPhotoAiSettings', { body: input }, as),
  });
}

function smartRetryFailed(): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => operate(context, 'retryFailedPhotoAi', {}, as),
  });
}

function smartReanalyse(): Selection {
  return selection({
    input: z.strictObject({ estimateMicros: z.int().nonnegative(), everything: z.boolean() }),
    run: (context, input, as) => operate(context, 'reanalysePhotos', { body: input }, as),
  });
}

export const PHOTO_EDITS: Readonly<Record<string, Selection>> = {
  person_update: personUpdate(),
  person_merge: personMerge(),
  person_remove_faces: personRemoveFaces(),
  person_dismiss_merge: personDismissMerge(),
  album_members: albumMembersSelection(),
  album_join: albumMembership('joinPhotoAlbum'),
  album_leave: albumMembership('leavePhotoAlbum'),
  album_comment: albumComment(),
  album_like: albumLike(),
  album_activity_delete: albumActivityDelete(),
  partner_set: partnerSet(),
  partner_accept: partnerAnswer('acceptPhotoPartner'),
  partner_stop: partnerAnswer('stopPhotoPartner'),
  partner_save: partnerSave(),
  smart_settings: smartSettings(),
  smart_reanalyse: smartReanalyse(),
  smart_retry_failed: smartRetryFailed(),
  ...PHOTO_MEDIA_EDITS,
};
