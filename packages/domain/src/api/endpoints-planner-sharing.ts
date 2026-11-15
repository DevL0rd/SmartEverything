import { z } from 'zod';
import {
  PLANNER_GUEST_ROW,
  PLANNER_GUEST_SUGGESTION,
  PLANNER_GUEST_SUGGESTIONS_QUERY,
  PLANNER_GUESTS_SET,
  PLANNER_RSVP_BODY,
} from '../planner/guests';
import {
  PLANNER_COLLECTION_SHARE_ROW,
  PLANNER_SHARE_SET,
  PLANNER_SHARE_VIEWER_CHANGES,
} from '../planner/sharing';
import { NO_BODY, endpoint } from './endpoint';
import { PLANNER_PERSON_QUERY } from './endpoints-planner-items';
import { DONE, ID, NOTHING } from './primitives';

const SHARE_PARAMS = z.strictObject({ collectionId: ID, personId: ID });

const ITEM_PARAMS = z.strictObject({ itemId: ID });

const GUEST_PARAMS = z.strictObject({ itemId: ID, guestId: ID });

export const PLANNER_SHARING_ENDPOINTS = {
  sharePlannerCollection: endpoint({
    method: 'PUT',
    path: '/api/planner/collections/:collectionId/shares/:personId',
    access: 'member',
    summary:
      'Share a calendar or list with another person as a viewer or an editor, or change their role; only its owner may',
    params: SHARE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_SHARE_SET,
    response: PLANNER_COLLECTION_SHARE_ROW,
  }),
  changePlannerShare: endpoint({
    method: 'PATCH',
    path: '/api/planner/collections/:collectionId/shares/:personId',
    access: 'member',
    summary: 'Choose the colour and visibility a calendar shared with you has for you',
    params: SHARE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_SHARE_VIEWER_CHANGES,
    response: PLANNER_COLLECTION_SHARE_ROW,
  }),
  unsharePlannerCollection: endpoint({
    method: 'DELETE',
    path: '/api/planner/collections/:collectionId/shares/:personId',
    access: 'member',
    summary:
      'Stop sharing a calendar or list with a person; the person may also leave it themselves',
    params: SHARE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  setPlannerGuests: endpoint({
    method: 'PUT',
    path: '/api/planner/items/:itemId/guests',
    access: 'member',
    summary:
      'Replace the guest list of an event with household members and email contacts; new guests are invited and removed ones are told',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_GUESTS_SET,
    response: z.array(PLANNER_GUEST_ROW),
  }),
  respondPlannerInvite: endpoint({
    method: 'POST',
    path: '/api/planner/items/:itemId/rsvp',
    access: 'member',
    summary: 'Answer an invitation to an event with yes, no or maybe and an optional note',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_RSVP_BODY,
    response: PLANNER_GUEST_ROW,
  }),
  resendPlannerInvite: endpoint({
    method: 'POST',
    path: '/api/planner/items/:itemId/guests/:guestId/resend',
    access: 'member',
    summary: 'Send the invitation email to one guest again',
    params: GUEST_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_GUEST_ROW,
  }),
  plannerInviteLink: endpoint({
    method: 'GET',
    path: '/api/planner/items/:itemId/guests/:guestId/link',
    access: 'member',
    summary: 'The invitation link of one email guest, for the organiser to copy and share',
    params: GUEST_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: z.strictObject({ url: z.string().min(1) }),
  }),
  suggestPlannerGuests: endpoint({
    method: 'GET',
    path: '/api/planner/guest-suggestions',
    access: 'member',
    summary: 'Email contacts the person invited before that match the typed text',
    params: NOTHING,
    query: PLANNER_GUEST_SUGGESTIONS_QUERY,
    body: NO_BODY,
    response: z.array(PLANNER_GUEST_SUGGESTION),
  }),
} as const;
