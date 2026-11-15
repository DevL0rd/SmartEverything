import { z } from 'zod';
import { COUNT, ID, MOMENT, NAME } from './shared';

export const PHOTO_GROUP_KINDS = ['person', 'pet'] as const;

export type PhotoGroupKind = (typeof PHOTO_GROUP_KINDS)[number];

export const PHOTO_LABEL = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^,]+$/, 'a label has no comma');

const FRACTION = z.number().min(0).max(1);

export const PHOTO_BOX = z
  .strictObject({ x: FRACTION, y: FRACTION, w: FRACTION.positive(), h: FRACTION.positive() })
  .refine(
    (box) => box.x + box.w <= 1 + Number.EPSILON * 8 && box.y + box.h <= 1 + Number.EPSILON * 8,
    {
      message: 'the box stays inside the picture',
      path: ['w'],
    },
  )
  .readonly();

export type PhotoBox = z.infer<typeof PHOTO_BOX>;

export const PHOTO_POINT = z.strictObject({ x: FRACTION, y: FRACTION }).readonly();

export type PhotoPoint = z.infer<typeof PHOTO_POINT>;

export const PHOTO_GROUP = z
  .strictObject({
    id: ID,
    kind: z.enum(PHOTO_GROUP_KINDS),
    name: NAME.nullable(),
    species: NAME.nullable(),
    linkedProfileId: ID.nullable(),
    coverFaceId: ID,
    coverItemId: ID,
    coverBox: PHOTO_BOX,
    hidden: z.boolean(),
    count: COUNT.positive(),
    updatedAt: MOMENT,
  })
  .refine((group) => (group.kind === 'pet') === (group.species !== null), {
    message: 'a pet group names its species and a person group has none',
    path: ['species'],
  })
  .refine((group) => group.kind === 'person' || group.linkedProfileId === null, {
    message: 'only a person group links to a profile',
    path: ['linkedProfileId'],
  })
  .readonly();

export type PhotoGroup = z.infer<typeof PHOTO_GROUP>;

export const PHOTO_MERGE_SUGGESTION = z
  .strictObject({
    groupIds: z.tuple([ID, ID]),
    similarity: z.number().min(-1).max(1),
  })
  .refine((suggestion) => suggestion.groupIds[0] !== suggestion.groupIds[1], {
    message: 'a suggestion names two different groups',
    path: ['groupIds'],
  })
  .readonly();

export type PhotoMergeSuggestion = z.infer<typeof PHOTO_MERGE_SUGGESTION>;

export const PHOTO_PEOPLE = z
  .strictObject({
    groups: z.array(PHOTO_GROUP).readonly(),
    mergeSuggestions: z.array(PHOTO_MERGE_SUGGESTION).readonly(),
  })
  .readonly();

export type PhotoPeople = z.infer<typeof PHOTO_PEOPLE>;

export const PHOTO_PEOPLE_QUERY = z.strictObject({ kind: z.enum(PHOTO_GROUP_KINDS).optional() });

export const PHOTO_GROUP_PARAMS = z.strictObject({ groupId: ID });

export const PHOTO_GROUP_UPDATE = z
  .strictObject({
    name: NAME.nullable().optional(),
    linkedProfileId: ID.nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'name at least one field to change',
  });

export type PhotoGroupUpdate = z.infer<typeof PHOTO_GROUP_UPDATE>;

export const PHOTO_GROUP_MERGE = z
  .strictObject({ targetId: ID, sourceIds: z.array(ID).min(1) })
  .refine((merge) => !merge.sourceIds.includes(merge.targetId), {
    message: 'a group is not merged into itself',
    path: ['sourceIds'],
  })
  .refine((merge) => new Set(merge.sourceIds).size === merge.sourceIds.length, {
    message: 'a source group is named once',
    path: ['sourceIds'],
  });

export type PhotoGroupMerge = z.infer<typeof PHOTO_GROUP_MERGE>;

export const PHOTO_MERGE_DISMISS = z
  .strictObject({ groupIds: z.tuple([ID, ID]) })
  .refine((dismiss) => dismiss.groupIds[0] !== dismiss.groupIds[1], {
    message: 'a suggestion names two different groups',
    path: ['groupIds'],
  });

export type PhotoMergeDismiss = z.infer<typeof PHOTO_MERGE_DISMISS>;

export const PHOTO_REMOVE_FACES = z.strictObject({ faceIds: z.array(ID).min(1) });

export type PhotoRemoveFaces = z.infer<typeof PHOTO_REMOVE_FACES>;

export const PHOTO_FACE = z
  .strictObject({
    id: ID,
    kind: z.enum(PHOTO_GROUP_KINDS),
    species: NAME.nullable(),
    box: PHOTO_BOX,
    groupId: ID.nullable(),
    groupName: NAME.nullable(),
  })
  .refine((face) => (face.kind === 'pet') === (face.species !== null), {
    message: 'a pet names its species and a face has none',
    path: ['species'],
  })
  .refine((face) => face.groupId !== null || face.groupName === null, {
    message: 'a name needs a group',
    path: ['groupName'],
  })
  .readonly();

export type PhotoFace = z.infer<typeof PHOTO_FACE>;

export const PHOTO_ITEM_FACES = z
  .strictObject({ itemId: ID, faces: z.array(PHOTO_FACE).readonly() })
  .readonly();

export type PhotoItemFaces = z.infer<typeof PHOTO_ITEM_FACES>;
