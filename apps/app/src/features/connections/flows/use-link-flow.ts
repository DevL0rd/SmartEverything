import { useState } from 'react';
import type { Provider, ProviderCredentials } from '@smarteverything/domain';
import { cancelProviderLink, linkProvider } from '../../../api/providers';
import { confirm } from '../../../components/confirm-store';
import { notifyFailure } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { useProviderLink } from '../../../store/selectors';
import { leaveFlow } from './leave-flow';
import { inProgress, stageOf, type LinkStage, type SentLink } from '../model/link-stage';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';
export interface LinkFlow {
  readonly stage: LinkStage;
  readonly sending: boolean;
  readonly start: (credentials: ProviderCredentials) => void;
  readonly restart: () => void;
  readonly cancel: () => void;
}

export function useLinkFlow(provider: Provider): LinkFlow {
  const row = useProviderLink(provider);
  const [sent, setSent] = useState<SentLink | null>(null);
  const sending = useMutationState();
  const stage = stageOf(row, sent);
  const start = (credentials: ProviderCredentials): void => {
    if (sending.busy) {
      return;
    }
    setSent({ baseline: row?.updated_at ?? null });
    sending.run(
      () =>
        trackConnection('provider.link', { provider }, () => linkProvider(credentials)).catch(
          (error: unknown) => {
            setSent(null);
            throw error;
          },
        ),
      { failure: 'Sign-in didn’t start' },
    );
  };
  const cancel = (): void => {
    if (!inProgress(stage)) {
      leaveFlow();
      return;
    }
    background(
      confirm({ title: 'Stop signing in?', confirmLabel: 'Stop', tone: 'destructive' }).then(
        (stop) => {
          if (!stop) {
            return;
          }
          trackConnection('provider.link_cancel', { provider }, () =>
            cancelProviderLink(provider),
          ).then(leaveFlow, notifyFailure('Sign-in didn’t stop'));
        },
      ),
      'use_link_flow.confirm_failed',
    );
  };
  return {
    stage,
    sending: sending.busy,
    start,
    restart: (): void => {
      setSent(null);
    },
    cancel,
  };
}
