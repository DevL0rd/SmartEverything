import { z } from 'zod';
import { DRIVE_GRANT_ROLE } from './grant';
import { DRIVE_ITEM } from './item';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_ACCESS_REQUEST_STATES = ['pending', 'approved', 'declined'] as const;

export type DriveAccessRequestState = (typeof DRIVE_ACCESS_REQUEST_STATES)[number];

export const DRIVE_ACCESS_REQUEST = z
  .strictObject({
    id: ID,
    itemId: ID,
    itemName: z
      .string()
      .min(1)
      .nullable()
      .describe('Null for the person who asked until the request is approved'),
    requesterProfileId: ID,
    ownerProfileId: ID,
    role: DRIVE_GRANT_ROLE,
    message: z.string().trim().min(1).nullable(),
    state: z.enum(DRIVE_ACCESS_REQUEST_STATES),
    answeredBy: ID.nullable(),
    answeredAt: MOMENT.nullable(),
    expiresAt: MOMENT.nullable().describe('When the access an approval wrote ends'),
    createdAt: MOMENT,
  })
  .refine(
    (request) =>
      (request.state === 'pending') === (request.answeredAt === null) &&
      (request.answeredAt === null) === (request.answeredBy === null),
    { message: 'only an answered request names who answered and when', path: ['answeredAt'] },
  )
  .readonly();

export type DriveAccessRequest = z.infer<typeof DRIVE_ACCESS_REQUEST>;

export const DRIVE_ACCESS_REQUEST_CREATE = z
  .strictObject({
    id: ID.optional().describe(
      'Id the client generated for the new request; repeating the request with the same id returns the request already made',
    ),
    itemId: ID,
    role: DRIVE_GRANT_ROLE,
    message: z.string().trim().min(1).nullable(),
  })
  .readonly();

export type DriveAccessRequestCreate = z.infer<typeof DRIVE_ACCESS_REQUEST_CREATE>;

export const DRIVE_ACCESS_ANSWER = z
  .discriminatedUnion('decision', [
    z.strictObject({
      decision: z.literal('approve'),
      role: DRIVE_GRANT_ROLE,
      expiresAt: MOMENT.nullable(),
    }),
    z.strictObject({ decision: z.literal('decline') }),
  ])
  .refine(
    (answer) =>
      answer.decision === 'decline' ||
      answer.expiresAt === null ||
      Date.parse(answer.expiresAt) > Date.now(),
    { message: 'access can only expire in the future', path: ['expiresAt'] },
  )
  .readonly();

export type DriveAccessAnswer = z.infer<typeof DRIVE_ACCESS_ANSWER>;

export const DRIVE_ACCESS_BOXES = ['made', 'waiting'] as const;

export type DriveAccessBox = (typeof DRIVE_ACCESS_BOXES)[number];

export const DRIVE_OPEN_LEVELS = ['own', 'shared', 'edit', 'view'] as const;

export const DRIVE_OPEN_ITEM = z
  .discriminatedUnion('access', [
    z.strictObject({ access: z.enum(DRIVE_OPEN_LEVELS), item: DRIVE_ITEM }),
    z.strictObject({
      access: z.literal('none'),
      requestable: z.boolean(),
      pendingRequest: DRIVE_ACCESS_REQUEST.nullable(),
    }),
  ])
  .readonly();

export type DriveOpenItem = z.infer<typeof DRIVE_OPEN_ITEM>;
