export const CLAUDE_BILLING_CODES = [
  'native_paid_extra_usage_enabled',
  'native_quota_exhausted',
  'native_billing_policy_unknown',
  'native_billing_freshness_unavailable',
] as const;

export type ClaudeBillingCode = (typeof CLAUDE_BILLING_CODES)[number];

export interface ClaudeBillingNotice {
  readonly code: ClaudeBillingCode;
  readonly tone: 'warning' | 'critical';
  readonly title: string;
  readonly hint: string;
  readonly detail: string;
}

export const CLAUDE_BILLING_NOTICES: Readonly<Record<ClaudeBillingCode, ClaudeBillingNotice>> = {
  native_paid_extra_usage_enabled: {
    code: 'native_paid_extra_usage_enabled',
    tone: 'critical',
    title: 'Paid extra usage is on',
    hint: 'Turn it off in your Claude settings to chat.',
    detail:
      'Claude reports that paid extra usage is enabled on this account. SmartEverything only runs Claude chats on your included subscription, so chats stay paused until it is off.',
  },
  native_quota_exhausted: {
    code: 'native_quota_exhausted',
    tone: 'warning',
    title: 'Claude usage limit reached',
    hint: 'Chats resume when your limit resets.',
    detail:
      'The included subscription usage is used up. No extra-usage or API fallback is ever used, so chats wait for the limit to reset.',
  },
  native_billing_policy_unknown: {
    code: 'native_billing_policy_unknown',
    tone: 'warning',
    title: 'Can’t confirm your Claude plan',
    hint: 'Check again, or sign in to Claude on this computer.',
    detail:
      'The Claude usage report on this computer was missing or unreadable, so included quota and paid extra usage could not be verified. Chats stay paused until it can be.',
  },
  native_billing_freshness_unavailable: {
    code: 'native_billing_freshness_unavailable',
    tone: 'warning',
    title: 'Claude plan info is out of date',
    hint: 'Check again in a moment.',
    detail:
      'The usage report was served from a cache or has a window that already reset, so it cannot prove paid extra usage is off right now. Chats stay paused until a live report confirms it.',
  },
};

export function claudeBillingReason(notice: ClaudeBillingNotice): string {
  return `${notice.title}. ${notice.hint}`;
}

export function claudeBillingNoticeFor(reason: string | null): ClaudeBillingNotice | null {
  if (reason === null) return null;
  return (
    CLAUDE_BILLING_CODES.map((code) => CLAUDE_BILLING_NOTICES[code]).find(
      (notice) => claudeBillingReason(notice) === reason,
    ) ?? null
  );
}
