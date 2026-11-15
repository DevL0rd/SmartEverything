import {
  ALBUM_MEMBER_ROLES,
  PARTNER_SCOPES,
  PHOTO_ERASE_STROKE,
  PHOTO_RECIPE,
  PHOTO_SAVE_MODES,
  VIDEO_TRIM,
} from '@smarteverything/domain';
import { z } from 'zod';

export const ID = z.uuid();
export const ITEM_IDS = z.array(ID).min(1);
export const TEXT = z.string().trim().min(1);
export const MEMBER_ROLES = z.enum([...ALBUM_MEMBER_ROLES, 'none']);

export const PHOTO_EDIT_FIELDS = {
  groupId: ID.optional().describe(
    'A person or pet id from drive_read view people, for person_update, person_merge (the group that stays) and person_remove_faces',
  ),
  sourceGroupIds: z
    .array(ID)
    .min(1)
    .optional()
    .describe('The groups that are the same person or pet and fold into groupId, for person_merge'),
  faceIds: z
    .array(ID)
    .min(1)
    .optional()
    .describe(
      'Face ids from drive_read view item_faces that are not this person or pet, for person_remove_faces',
    ),
  personName: TEXT.nullable()
    .optional()
    .describe('The name of a person or pet; null clears it, for person_update'),
  linkedProfileId: ID.nullable()
    .optional()
    .describe('The household member this person is; null unlinks, for person_update'),
  hidden: z
    .boolean()
    .optional()
    .describe('true hides a person or pet from People, for person_update'),
  members: z
    .array(z.strictObject({ profileId: ID, role: MEMBER_ROLES }))
    .min(1)
    .optional()
    .describe(
      'People to add to a shared album as contributor (may add photos) or viewer, or none to remove them and the photos they added, for album_members',
    ),
  activityId: ID.optional().describe(
    'Your own comment or like id from drive_read view album_activity, for album_activity_delete; destructive',
  ),
  scope: z
    .enum(PARTNER_SCOPES)
    .optional()
    .describe('all shares every photo, people shares only photos of groupIds, for partner_set'),
  groupIds: z
    .array(ID)
    .optional()
    .describe(
      'The people or pets whose photos a partner gets when scope is people, for partner_set',
    ),
  fromDay: z.iso
    .date()
    .optional()
    .describe('The first day the partner sees photos from (YYYY-MM-DD), for partner_set'),
  autoSave: z
    .boolean()
    .optional()
    .describe(
      'true saves every new photo of the partner into your library, false stops, for partner_save without itemIds',
    ),
  recipe: PHOTO_RECIPE.optional().describe(
    'The whole edit of the photo: crop, quarter turns, straighten, flips, light, colour, filter and erased patches; the edit replaces any earlier one, for photo_edit',
  ),
  saveMode: z
    .enum(PHOTO_SAVE_MODES)
    .optional()
    .describe(
      'version saves over the photo and keeps the original as a version; copy saves a new photo beside it, for photo_edit and video_edit',
    ),
  strokes: z
    .array(PHOTO_ERASE_STROKE)
    .min(1)
    .optional()
    .describe(
      'Brush strokes with points and size as fractions of the picture (0 to 1), for photo_erase; answers a patch to put in the recipe patches',
    ),
  trim: VIDEO_TRIM.nullable()
    .optional()
    .describe('Keep this part of the video, in milliseconds; null keeps it all, for video_edit'),
  stabilize: z.boolean().optional().describe('true steadies shaky video, for video_edit'),
  takenAt: z.iso
    .datetime({ offset: true })
    .optional()
    .describe('Set the date and time taken, for photo_meta'),
  shiftMinutes: z
    .int()
    .optional()
    .describe('Move the date taken of every photo by this many minutes, for photo_meta'),
  latitude: z.number().min(-90).max(90).optional().describe('Set the place, for photo_meta'),
  longitude: z.number().min(-180).max(180).optional().describe('Set the place, for photo_meta'),
  locationLabel: TEXT.nullable().optional().describe('A name for the place, for photo_meta'),
  clearLocation: z.literal(true).optional().describe('Remove the place, for photo_meta'),
  smartSearch: z
    .boolean()
    .optional()
    .describe('Smart search and tags on or off for you, for smart_settings'),
  faceGrouping: z
    .boolean()
    .optional()
    .describe('Face grouping on or off for you, for smart_settings'),
  estimateMicros: z
    .int()
    .nonnegative()
    .optional()
    .describe('The estimate from drive_read view smart_status, for smart_reanalyse (owner only)'),
} as const;
