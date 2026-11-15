import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME } from './items';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_GUEST_KINDS = ['person', 'email'] as const;

export const PLANNER_GUEST_RESPONSES = ['needs_action', 'yes', 'no', 'maybe'] as const;

export type PlannerGuestResponse = (typeof PLANNER_GUEST_RESPONSES)[number];

export const PLANNER_RSVP_ANSWERS = ['yes', 'no', 'maybe'] as const;

export type PlannerRsvpAnswer = (typeof PLANNER_RSVP_ANSWERS)[number];

export const PLANNER_GUEST_DELIVERIES = [
  'not_sent',
  'sent',
  'failed',
  'link_only',
  'google',
] as const;

export type PlannerGuestDelivery = (typeof PLANNER_GUEST_DELIVERIES)[number];

const EMAIL = z.email();

const GUEST_NAME = z.string().trim().min(1);

function flag(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: 'custom', path: [path], message });
}

function flagIdentity(
  row: {
    readonly kind: 'person' | 'email';
    readonly profile_id: string | null;
    readonly email: string | null;
    readonly delivery: string;
  },
  context: z.RefinementCtx,
): void {
  if (row.kind === 'person') {
    if (row.profile_id === null) flag(context, 'profile_id', 'a member guest names the person');
    if (row.email !== null) flag(context, 'email', 'a member guest has no email address');
    if (row.delivery !== 'not_sent') {
      flag(context, 'delivery', 'a member guest gets a notice, never an email');
    }
    return;
  }
  if (row.email === null) flag(context, 'email', 'an email guest has an address');
  if (row.profile_id !== null) flag(context, 'profile_id', 'an email guest is no person');
}

export const PLANNER_GUEST_ROW = z
  .strictObject({
    id: ID,
    item_id: ID,
    kind: z.enum(PLANNER_GUEST_KINDS),
    profile_id: ID.nullable(),
    email: EMAIL.nullable(),
    name: GUEST_NAME.nullable(),
    response: z.enum(PLANNER_GUEST_RESPONSES),
    note: z.string().min(1).nullable(),
    delivery: z.enum(PLANNER_GUEST_DELIVERIES),
    delivery_detail: z.string().min(1).nullable(),
    invited_at: MOMENT,
    responded_at: MOMENT.nullable(),
  })
  .superRefine((row, context) => {
    flagIdentity(row, context);
    if ((row.delivery === 'failed') !== (row.delivery_detail !== null)) {
      flag(context, 'delivery_detail', 'a failed delivery carries its reason and no other does');
    }
    if ((row.response === 'needs_action') !== (row.responded_at === null)) {
      flag(context, 'responded_at', 'an answered guest has an answer time and a waiting one none');
    }
    if (row.response === 'needs_action' && row.note !== null) {
      flag(context, 'note', 'a note belongs to an answer');
    }
  })
  .readonly();

export type PlannerGuestRow = z.infer<typeof PLANNER_GUEST_ROW>;

export const PLANNER_GUEST_ENTRY = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('person'), profile_id: ID }),
    z.strictObject({
      kind: z.literal('email'),
      email: EMAIL,
      name: GUEST_NAME.nullable().default(null),
    }),
  ])
  .readonly();

export type PlannerGuestEntry = z.infer<typeof PLANNER_GUEST_ENTRY>;

export const PLANNER_GUESTS_SET = z.strictObject({ guests: z.array(PLANNER_GUEST_ENTRY) });

export const PLANNER_RSVP_BODY = z.strictObject({
  response: z.enum(PLANNER_RSVP_ANSWERS),
  note: z.string().min(1).nullable().default(null),
});

export const PLANNER_GUEST_SUGGESTIONS_QUERY = z.strictObject({
  personId: ID.optional(),
  text: z.string().trim(),
});

export const PLANNER_GUEST_SUGGESTION = z
  .strictObject({ email: EMAIL, name: GUEST_NAME.nullable() })
  .readonly();

export type PlannerGuestSuggestion = z.infer<typeof PLANNER_GUEST_SUGGESTION>;

export const PLANNER_RSVP_PATHS = { page: '/rsvp/:token' } as const;

export const PLANNER_RSVP_PAGE_QUERY = z.strictObject({
  answer: z.enum(PLANNER_RSVP_ANSWERS).optional(),
});

export const PLANNER_RSVP_PAGE = z
  .strictObject({
    title: z.string().min(1),
    location: z.string().min(1).nullable(),
    organiser: z.string().min(1),
    all_day: z.boolean(),
    start_local: z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]),
    end_local: z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]).nullable(),
    time_zone: TIME_ZONE.nullable(),
    guest_name: GUEST_NAME.nullable(),
    response: z.enum(PLANNER_GUEST_RESPONSES),
    note: z.string().min(1).nullable(),
    cancelled: z.boolean(),
    booking: z.boolean(),
  })
  .readonly();

export type PlannerRsvpPage = z.infer<typeof PLANNER_RSVP_PAGE>;

export const PLANNER_RSVP_RECEIPT = z
  .strictObject({ response: z.enum(PLANNER_RSVP_ANSWERS), responded_at: MOMENT })
  .readonly();
