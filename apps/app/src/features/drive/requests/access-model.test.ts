import { describe, expect, it } from 'vitest';
import {
  ITEM_ID,
  OTHER_ROW_ID,
  OWNER_ID,
  REQUESTER_ID,
  accessRequestRow,
  documentFixture,
} from '../data/fixtures';
import {
  DECLINE,
  accessScreenStateOf,
  approvalOf,
  askBodyOf,
  declinedLineOf,
  messageOf,
  pendingRequestsFor,
  requestsTitleOf,
  sentLineOf,
  wantsLineOf,
} from './access-model';

const ANSWERED = { answeredBy: OWNER_ID, answeredAt: '2026-11-07T11:00:00.000Z' };

describe('the access screen', () => {
  it('opens the item when the viewer already has access', () => {
    const item = documentFixture();
    expect(accessScreenStateOf({ access: 'view', item })).toEqual({ kind: 'open', item });
    expect(accessScreenStateOf({ access: 'own', item }).kind).toBe('open');
  });

  it('asks, shows a sent request, offers to ask again after a decline, and names an unavailable item', () => {
    expect(
      accessScreenStateOf({ access: 'none', requestable: true, pendingRequest: null }).kind,
    ).toBe('ask');
    const pending = accessRequestRow({ itemName: null });
    expect(
      accessScreenStateOf({ access: 'none', requestable: true, pendingRequest: pending }),
    ).toEqual({ kind: 'sent', request: pending });
    const declined = accessRequestRow({ itemName: null, state: 'declined', ...ANSWERED });
    expect(
      accessScreenStateOf({ access: 'none', requestable: true, pendingRequest: declined }).kind,
    ).toBe('declined');
    expect(
      accessScreenStateOf({ access: 'none', requestable: false, pendingRequest: null }).kind,
    ).toBe('unavailable');
  });

  it('words the request card without ever naming the item', () => {
    const request = accessRequestRow({ itemName: null });
    const now = Date.parse(request.createdAt) + 3 * 3_600_000;
    expect(askBodyOf('Alex')).toMatch(/^Ask Alex to share it with you/);
    expect(askBodyOf(null)).toMatch(/^Ask its owner/);
    expect(sentLineOf(request, now, 'Alex')).toBe(
      'Request sent 3 h ago. Alex gets a notification and can approve it.',
    );
    const declined = accessRequestRow({ state: 'declined', ...ANSWERED });
    expect(declinedLineOf(declined, Date.parse(ANSWERED.answeredAt), null)).toBe(
      'The owner declined your request just now. You can ask again.',
    );
  });

  it('keeps an empty message out of the request', () => {
    expect(messageOf('   ')).toBeNull();
    expect(messageOf('  Need it for taxes ')).toBe('Need it for taxes');
  });
});

describe('requests in the share sheet', () => {
  it('lists only pending requests on this item that wait for the viewer, oldest first', () => {
    const newer = accessRequestRow({ createdAt: '2026-11-07T11:00:00.000Z' });
    const older = accessRequestRow({ id: OTHER_ROW_ID, createdAt: '2026-11-06T11:00:00.000Z' });
    const answered = accessRequestRow({ state: 'approved', ...ANSWERED });
    const other = accessRequestRow({ itemId: 'a1b2c3d4-0000-4000-8000-000000000999' });
    expect(pendingRequestsFor([newer, older, answered, other], ITEM_ID, OWNER_ID)).toEqual([
      older,
      newer,
    ]);
    expect(pendingRequestsFor([newer], ITEM_ID, REQUESTER_ID)).toEqual([]);
  });

  it('approves with the asked role and no end, or declines', () => {
    expect(approvalOf({ role: 'edit' })).toEqual({
      decision: 'approve',
      role: 'edit',
      expiresAt: null,
    });
    expect(DECLINE).toEqual({ decision: 'decline' });
    expect(wantsLineOf({ role: 'view' }, 'Sam')).toBe('Sam wants to view');
    expect(requestsTitleOf(1)).toBe('Access request');
    expect(requestsTitleOf(3)).toBe('Access requests · 3');
  });
});
