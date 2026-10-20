import type { ProviderLinkRow, ProviderProblem } from '@smarteverything/domain';
import { problemTitle } from './problems';

export const USER_CODE_PATH = [
  'Smart Life',
  'Me',
  'Settings',
  'Account and Security',
  'User Code',
] as const;

export const SCAN_STEPS = [
  'Open Smart Life or Tuya Smart on your phone.',
  'Tap + at the top, then Scan.',
  'Point the camera at this code and confirm.',
] as const;

export type TuyaStart = 'code' | 'scan';

export function startOf(row: ProviderLinkRow | null, differentAccount: boolean): TuyaStart {
  if (differentAccount || row === null) {
    return 'code';
  }
  return row.status === 'linked' || row.status === 'needs_attention' ? 'scan' : 'code';
}

export type TuyaFailureAction = 'new_code' | 'scan_again' | 'enter_code' | 'try_again';

export type TuyaResend = 'typed' | 'stored' | 'none';

export function resendOf(action: TuyaFailureAction, scanOnly: boolean): TuyaResend {
  switch (action) {
    case 'new_code':
      return 'typed';
    case 'scan_again':
      return 'stored';
    case 'try_again':
      return scanOnly ? 'stored' : 'none';
    case 'enter_code':
      return 'none';
  }
}

export interface TuyaFailure {
  readonly title: string;
  readonly body: string;
  readonly action: TuyaFailureAction;
  readonly actionLabel: string;
}

const CODE_HELP =
  'Copy it again from Smart Life: Me > Settings > Account and Security > User Code. Capital letters matter.';

const KNOWN_FAILURES: Readonly<Partial<Record<ProviderProblem, TuyaFailure>>> = {
  bad_credentials: {
    title: 'That User Code didn’t work',
    body: CODE_HELP,
    action: 'enter_code',
    actionLabel: 'Enter User Code',
  },
  qr_expired: {
    title: 'The code expired',
    body: 'Codes last 5 minutes. Get a new one and scan it right away.',
    action: 'new_code',
    actionLabel: 'New code',
  },
  session_expired: {
    title: 'Smart Life signed the hub out',
    body: 'Scan a new code to sign in again. Your devices return as soon as you do.',
    action: 'scan_again',
    actionLabel: 'Scan again',
  },
  not_supported: {
    title: 'This app isn’t supported',
    body: 'Only the Smart Life and Tuya Smart apps work. Apps made by other brands can’t be linked.',
    action: 'enter_code',
    actionLabel: 'Use a different account',
  },
};

export function failureOf(problem: ProviderProblem, detail: string | null): TuyaFailure {
  return (
    KNOWN_FAILURES[problem] ?? {
      title: problemTitle('tuya', problem),
      body: detail ?? 'Try again in a moment.',
      action: 'try_again',
      actionLabel: 'Try again',
    }
  );
}
