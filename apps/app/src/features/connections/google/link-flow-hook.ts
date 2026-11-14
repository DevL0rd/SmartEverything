import { useState } from 'react';
import { background } from '@smarteverything/logging';
import { finishGoogleLink, startGoogleLink } from '../../../api/google';
import { notify, notifyFailure } from '../../../components/toast-store';
import { trackConnection } from '../connections-log';
import type { GoogleClientPlatform } from './google-app-setup';
import { googleConsent } from './link-flow-consent';
import {
  deniedDetail,
  runGoogleLink,
  type GoogleConsent,
  type GoogleLinkOutcome,
} from './link-flow';
import type { GoogleLinkState } from './link-slot';

export interface GoogleLinkFlow extends GoogleLinkState {
  readonly cancel: (() => void) | null;
}

const CALLS = { start: startGoogleLink, finish: finishGoogleLink };

const UNSUPPORTED_DETAIL = 'Link Google from the Android app or the Desktop app.';

function announce(
  outcome: GoogleLinkOutcome,
  refuse: (platform: GoogleClientPlatform) => void,
): void {
  switch (outcome.kind) {
    case 'linked':
      notify({ message: 'Google linked' });
      return;
    case 'cancelled':
      return;
    case 'denied':
      notify({ message: 'Google wasn’t linked', detail: deniedDetail(outcome.reason) });
      return;
    case 'refused_client':
      refuse(outcome.platform);
  }
}

function cancelOf(consent: GoogleConsent | null, busy: boolean): (() => void) | null {
  const cancel = consent?.cancel ?? null;
  if (!busy || cancel === null) return null;
  return () => {
    background(cancel(), 'google.link_cancel_failed');
  };
}

export function useGoogleLinkFlow(personId: string): GoogleLinkFlow {
  const [busy, setBusy] = useState(false);
  const [refusedClient, setRefusedClient] = useState<GoogleClientPlatform | null>(null);
  const consent = googleConsent();
  const start = (): void => {
    if (busy) return;
    if (consent === null) {
      notify({ message: 'Google can’t be linked here', detail: UNSUPPORTED_DETAIL });
      return;
    }
    setBusy(true);
    setRefusedClient(null);
    const work = trackConnection('google.link', { platform: consent.platform }, () =>
      runGoogleLink(consent, CALLS, personId),
    ).then((outcome) => {
      announce(outcome, setRefusedClient);
    }, notifyFailure('Google wasn’t linked'));
    background(
      work.finally(() => {
        setBusy(false);
      }),
      'google.link_failed',
    );
  };
  return { busy, refusedClient, start, cancel: cancelOf(consent, busy) };
}
