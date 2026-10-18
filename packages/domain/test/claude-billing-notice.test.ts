import { describe, expect, it } from 'vitest';
import {
  CLAUDE_BILLING_CODES,
  CLAUDE_BILLING_NOTICES,
  claudeBillingNoticeFor,
  claudeBillingReason,
} from '../src/claude-billing-notice';

describe('claude billing notices', () => {
  it('keeps every reason short enough for one banner title and hint', () => {
    for (const code of CLAUDE_BILLING_CODES) {
      const notice = CLAUDE_BILLING_NOTICES[code];
      expect(notice.code).toBe(code);
      expect(claudeBillingReason(notice).length).toBeLessThanOrEqual(90);
    }
  });

  it('maps a reason back to its notice and nothing else', () => {
    for (const code of CLAUDE_BILLING_CODES) {
      const notice = CLAUDE_BILLING_NOTICES[code];
      expect(claudeBillingNoticeFor(claudeBillingReason(notice))).toBe(notice);
    }
    expect(claudeBillingNoticeFor('Claude is not signed in.')).toBeNull();
    expect(claudeBillingNoticeFor(null)).toBeNull();
  });
});
