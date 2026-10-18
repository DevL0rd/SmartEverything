import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { OVERVIEW_TARGET, detailsTargetOf, type DetailsTarget } from '../details/details-target';

export function useChatInfo(): {
  readonly open: boolean;
  readonly target: DetailsTarget;
  readonly show: () => void;
  readonly hide: () => void;
} {
  const params = useLocalSearchParams<{ sheet?: string; section?: string; agent?: string }>();
  const [state, setState] = useState({ open: false, target: OVERVIEW_TARGET });
  const requested = params.sheet === 'chat' && params.section !== 'browser';
  const [handled, setHandled] = useState(false);
  if (requested !== handled) {
    setHandled(requested);
    if (requested) setState({ open: true, target: detailsTargetOf(params) });
  }
  useEffect(() => {
    if (requested) {
      router.setParams({ sheet: undefined, section: undefined, agent: undefined });
    }
  }, [requested]);
  return {
    ...state,
    show: (): void => {
      setState({ open: true, target: detailsTargetOf({}) });
    },
    hide: (): void => {
      setState((current) => ({ ...current, open: false }));
    },
  };
}
