import { useState } from 'react';
import type { SmartThingsSetup } from '@smarteverything/domain';
import { authorizeSmartThings, setUpSmartThings } from '../../../api/smartthings';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useProviderLink, useSmartThingsWebhook } from '../../../store/selectors';
import { FIRST_STEP, type SmartThingsStep } from '../model/smartthings';
import { openInBrowser } from './prompt-body';

import { connectionsLog } from '../connections-log';
export interface SmartThingsFlow {
  readonly step: SmartThingsStep;
  readonly token: string;
  readonly setToken: (token: string) => void;
  readonly run: () => void;
  readonly signInAgain: () => void;
}

function rateText(seconds: number | null): string {
  return seconds === null
    ? 'SmartThings is busy. Try again soon.'
    : `SmartThings is busy. Try again in ${String(Math.ceil(seconds / 60))} min.`;
}

function nextStep(setup: SmartThingsSetup, baseline: string | null): SmartThingsStep {
  switch (setup.outcome) {
    case 'ready':
      openInBrowser(setup.authorization.url);
      return { kind: 'signin', baseline };
    case 'token_refused':
      return { kind: 'token', notice: 'SmartThings didn’t accept that token', missing: [] };
    case 'scopes_missing':
      return { kind: 'token', notice: 'Some boxes weren’t ticked', missing: setup.missing };
    case 'rate_limited':
      return { kind: 'token', notice: rateText(setup.retryAfterSeconds), missing: [] };
    case 'not_confirmed':
      return { kind: 'not_confirmed', reason: setup.reason };
  }
}

export function useSmartThingsFlow(): SmartThingsFlow {
  const row = useProviderLink('smartthings');
  const webhook = useSmartThingsWebhook();
  const [step, setStep] = useState<SmartThingsStep>(
    row?.status === 'linking' ? { kind: 'signin', baseline: null } : FIRST_STEP,
  );
  const [token, setToken] = useState('');
  const run = (): void => {
    const baseline = row?.updated_at ?? null;
    setStep({ kind: 'creating', confirmedBefore: webhook?.confirmedAt ?? null });
    connectionsLog.info('smartthings.setup_started', { tokenLength: token.trim().length });
    setUpSmartThings(token.trim()).then(
      (setup) => {
        connectionsLog.info('smartthings.setup_outcome', { outcome: setup.outcome });
        setStep(nextStep(setup, baseline));
      },
      (error: unknown) => {
        connectionsLog.error('smartthings.setup_failed', error);
        setStep({ kind: 'token', notice: errorText(error).title, missing: [] });
      },
    );
  };
  const signInAgain = (): void => {
    const baseline = row?.updated_at ?? null;
    connectionsLog.info('smartthings.sign_in_again');
    authorizeSmartThings().then(
      (url) => {
        openInBrowser(url);
        setStep({ kind: 'signin', baseline });
      },
      (error: unknown) => {
        connectionsLog.error('smartthings.sign_in_failed', error);
        notify({ message: 'Sign-in didn’t start', error, tone: 'critical' });
      },
    );
  };
  return { step, token, setToken, run, signInAgain };
}
