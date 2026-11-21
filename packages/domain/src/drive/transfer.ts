import { z } from 'zod';
import { DRIVE_ITEM_KINDS } from './item';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_TRANSFER_STATES = ['offered', 'accepted', 'declined', 'cancelled'] as const;

export type DriveTransferState = (typeof DRIVE_TRANSFER_STATES)[number];

export const DRIVE_TRANSFER = z
  .strictObject({
    id: ID,
    itemId: ID,
    itemName: z.string().min(1),
    itemKind: z.enum(DRIVE_ITEM_KINDS),
    bytes: COUNT,
    fromProfileId: ID,
    toProfileId: ID,
    state: z.enum(DRIVE_TRANSFER_STATES),
    createdAt: MOMENT,
    answeredAt: MOMENT.nullable(),
  })
  .refine((transfer) => (transfer.state === 'offered') === (transfer.answeredAt === null), {
    message: 'only an open offer is unanswered',
    path: ['answeredAt'],
  })
  .refine((transfer) => transfer.fromProfileId !== transfer.toProfileId, {
    message: 'an item moves to another person',
    path: ['toProfileId'],
  })
  .readonly();

export type DriveTransfer = z.infer<typeof DRIVE_TRANSFER>;

export const DRIVE_TRANSFER_OFFER = z
  .strictObject({
    id: ID.optional().describe(
      'Id the client generated for the new offer; repeating the offer with the same id returns the offer already made',
    ),
    itemId: ID,
    toProfileId: ID,
  })
  .readonly();

export type DriveTransferOffer = z.infer<typeof DRIVE_TRANSFER_OFFER>;

export const DRIVE_TRANSFER_ANSWER = z.strictObject({ accept: z.boolean() }).readonly();

export type DriveTransferAnswer = z.infer<typeof DRIVE_TRANSFER_ANSWER>;
