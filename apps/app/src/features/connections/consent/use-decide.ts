import { useState } from 'react';
import { ApiError, type McpConsentDecision, type McpConsentRequest } from '@smarteverything/domain';
import { decideMcpConsent } from '../../../api/access';
import { notify } from '../../../components/toast-store';
import { useEntityStore } from '../../../store/store-context';

import { connectionsLog } from '../connections-log';
export interface Decision {
  readonly busy: McpConsentDecision | null;
  readonly decide: (decision: McpConsentDecision) => void;
}

export function useDecide(request: McpConsentRequest, onDecided: () => void): Decision {
  const store = useEntityStore();
  const [busy, setBusy] = useState<McpConsentDecision | null>(null);
  const close = (): void => {
    store.update((state) => ({
      ...state,
      consentRequests: state.consentRequests.filter((item) => item.id !== request.id),
    }));
    onDecided();
  };
  const decide = (decision: McpConsentDecision): void => {
    setBusy(decision);
    connectionsLog.info('consent.decision_started', { requestId: request.id, decision });
    decideMcpConsent(request.id, decision)
      .then(close, (error: unknown) => {
        if (error instanceof ApiError && error.code === 'not_found') {
          connectionsLog.info('consent.request_gone', { requestId: request.id });
          close();
          return;
        }
        connectionsLog.error('consent.decision_failed', error, { requestId: request.id, decision });
        notify({ message: 'Your answer wasn’t sent', error, tone: 'critical' });
      })
      .finally(() => {
        setBusy(null);
      });
  };
  return { busy, decide };
}
