import { z } from 'zod';
import { COUNT, DAY, ID, MOMENT, NAME } from './shared';

export const ALBUM_MEMBER_ROLES = ['contributor', 'viewer'] as const;

export type AlbumMemberRole = (typeof ALBUM_MEMBER_ROLES)[number];

export const ALBUM_ACTIVITY_KINDS = ['added', 'comment', 'like', 'joined', 'left'] as const;

export type AlbumActivityKind = (typeof ALBUM_ACTIVITY_KINDS)[number];

export const ALBUM_PARAMS = z.strictObject({ albumId: ID });

export const ALBUM_MEMBER_PARAMS = z.strictObject({ albumId: ID, profileId: ID });

export const ALBUM_ACTIVITY_PARAMS = z.strictObject({ albumId: ID, activityId: ID });

export const ALBUM_MEMBER = z
  .strictObject({
    albumId: ID,
    profileId: ID,
    role: z.enum(ALBUM_MEMBER_ROLES),
    addedBy: ID,
    joinedAt: MOMENT.nullable(),
  })
  .readonly();

export type AlbumMember = z.infer<typeof ALBUM_MEMBER>;

export const ALBUM_MEMBER_INPUT = z.strictObject({
  profileId: ID,
  role: z.enum(ALBUM_MEMBER_ROLES),
});

export const ALBUM_MEMBERS_SET = z
  .strictObject({ members: z.array(ALBUM_MEMBER_INPUT).min(1) })
  .refine(
    (set) => new Set(set.members.map((member) => member.profileId)).size === set.members.length,
    { message: 'a person is named once', path: ['members'] },
  );

export type AlbumMembersSet = z.infer<typeof ALBUM_MEMBERS_SET>;

export const ALBUM_ACTIVITY = z
  .strictObject({
    id: ID,
    albumId: ID,
    itemId: ID.nullable(),
    profileId: ID,
    kind: z.enum(ALBUM_ACTIVITY_KINDS),
    text: NAME.nullable(),
    createdAt: MOMENT,
  })
  .refine((activity) => (activity.kind === 'comment') === (activity.text !== null), {
    message: 'a comment carries text and no other activity does',
    path: ['text'],
  })
  .refine((activity) => activity.kind !== 'added' || activity.itemId !== null, {
    message: 'an add names the photo',
    path: ['itemId'],
  })
  .readonly();

export type AlbumActivity = z.infer<typeof ALBUM_ACTIVITY>;

const ACTIVITY_CLIENT_ID = ID.optional().describe(
  'Id the client generated for the new comment or like; repeating the add with the same id returns the one already made',
);

export const ALBUM_ACTIVITY_CREATE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('comment'),
    text: NAME,
    itemId: ID.optional(),
    id: ACTIVITY_CLIENT_ID,
  }),
  z.strictObject({ kind: z.literal('like'), itemId: ID.optional(), id: ACTIVITY_CLIENT_ID }),
]);

export type AlbumActivityCreate = z.infer<typeof ALBUM_ACTIVITY_CREATE>;

export const PARTNER_SCOPES = ['all', 'people'] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

export const PARTNER_STATES = ['offered', 'accepted', 'stopped'] as const;

export type PartnerState = (typeof PARTNER_STATES)[number];

export const PARTNER_PARAMS = z.strictObject({ shareId: ID });

const PARTNER_RULE = {
  scope: z.enum(PARTNER_SCOPES),
  groupIds: z.array(ID).readonly(),
  fromDay: DAY,
};

interface PartnerRule {
  readonly scope: PartnerScope;
  readonly groupIds: readonly string[];
}

function scopeMatchesGroups(rule: PartnerRule): boolean {
  return rule.scope === 'all' ? rule.groupIds.length === 0 : rule.groupIds.length > 0;
}

const SCOPE_MATCHES_GROUPS = {
  message: 'all photos name no people and chosen people name at least one',
  path: ['groupIds'],
};

export const PARTNER_SHARE = z
  .strictObject({
    id: ID,
    sharerId: ID,
    recipientId: ID,
    ...PARTNER_RULE,
    state: z.enum(PARTNER_STATES),
    autoSave: z.boolean(),
    createdAt: MOMENT,
  })
  .refine(scopeMatchesGroups, SCOPE_MATCHES_GROUPS)
  .refine((share) => share.sharerId !== share.recipientId, {
    message: 'a person does not share with themselves',
    path: ['recipientId'],
  })
  .readonly();

export type PartnerShare = z.infer<typeof PARTNER_SHARE>;

export const PARTNER_SET = z
  .strictObject({ recipientId: ID, ...PARTNER_RULE })
  .refine(scopeMatchesGroups, SCOPE_MATCHES_GROUPS);

export type PartnerSet = z.infer<typeof PARTNER_SET>;

export const PARTNER_SAVE = z.strictObject({ itemIds: z.array(ID).min(1) });

export type PartnerSave = z.infer<typeof PARTNER_SAVE>;

export const PARTNER_SAVED = z.strictObject({ saved: COUNT }).readonly();

export const PARTNER_AUTO_SAVE = z.strictObject({ autoSave: z.boolean() });

export const SHARED_ALBUM_MEMBER = z
  .strictObject({ profileId: ID, role: z.enum(ALBUM_MEMBER_ROLES) })
  .readonly();

export type SharedAlbumMember = z.infer<typeof SHARED_ALBUM_MEMBER>;

export const SHARED_ALBUM = z
  .strictObject({
    albumId: ID,
    title: NAME,
    coverItemId: ID.nullable(),
    ownerProfileId: ID,
    role: z.enum([...ALBUM_MEMBER_ROLES, 'owner']),
    members: z.array(SHARED_ALBUM_MEMBER).readonly(),
    joined: z.boolean(),
    itemCount: COUNT,
    unread: COUNT,
    updatedAt: MOMENT,
  })
  .readonly();

export type SharedAlbum = z.infer<typeof SHARED_ALBUM>;

export const PHOTO_SHARING = z
  .strictObject({
    albums: z.array(SHARED_ALBUM).readonly(),
    partners: z.array(PARTNER_SHARE).readonly(),
    activity: z.array(ALBUM_ACTIVITY).readonly(),
    unread: COUNT,
  })
  .readonly();

export type PhotoSharing = z.infer<typeof PHOTO_SHARING>;

export const PHOTOS_ACTIVITY_NOTICE_KINDS = [...ALBUM_ACTIVITY_KINDS, 'invited'] as const;

export const PHOTOS_ACTIVITY_NOTICE = z
  .strictObject({
    type: z.literal('photos_activity'),
    albumId: ID,
    kind: z.enum(PHOTOS_ACTIVITY_NOTICE_KINDS),
    profileId: ID.optional(),
  })
  .refine((notice) => (notice.kind === 'invited') === (notice.profileId !== undefined), {
    message: 'an invited notice names the invited person and no other notice does',
    path: ['profileId'],
  });

export type PhotosActivityNotice = z.infer<typeof PHOTOS_ACTIVITY_NOTICE>;

export const PHOTOS_PARTNER_NOTICE = z.strictObject({
  type: z.literal('photos_partner'),
  shareId: ID,
  sharerId: ID,
  recipientId: ID,
  state: z.enum(PARTNER_STATES),
});

export type PhotosPartnerNotice = z.infer<typeof PHOTOS_PARTNER_NOTICE>;
