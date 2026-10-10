import { useState } from 'react';
import { router } from 'expo-router';
import type { Provider, ProviderCredentials } from '@smarteverything/domain';
import { linkProvider, unlinkProvider } from '../../../api/providers';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useProviderLink } from '../../../store/selectors';
import { inProgress, stageOf, type LinkStage, type SentLink } from '../model/link-stage';

export interface LinkFlow {
  readonly stage: LinkStage;
  readonly sending: boolean;
  readonly start: (credentials: ProviderCredentials) => void;
  readonly restart: () => void;
  readonly cancel: () => void;
}

export function closeFlow(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/settings');
}

export function useLinkFlow(provider: Provider): LinkFlow {
  const row = useProviderLink(provider);
  const [sent, setSent] = useState<SentLink | null>(null);
  const [sending, setSending] = useState(false);
  const stage = stageOf(row, sent);
  const start = (credentials: ProviderCredentials): void => {
    setSending(true);
    setSent({ baseline: row?.updated_at ?? null });
    linkProvider(credentials)
      .catch((error: unknown) => {
        setSent(null);
        notify({ message: 'Sign-in didn’t start', error, tone: 'critical' });
      })
      .finally(() => {
        setSending(false);
      });
  };
  const cancel = (): void => {
    if (!inProgress(stage)) {
      closeFlow();
      return;
    }
    void confirm({ title: 'Stop signing in?', confirmLabel: 'Stop', tone: 'destructive' }).then(
      (stop) => {
        if (!stop) {
          return;
        }
        unlinkProvider(provider).then(closeFlow, (error: unknown) => {
          notify({ message: 'Sign-in didn’t stop', error, tone: 'critical' });
        });
      },
    );
  };
  return {
    stage,
    sending,
    start,
    restart: (): void => {
      setSent(null);
    },
    cancel,
  };
}
