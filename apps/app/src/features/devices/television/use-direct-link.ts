import { useState } from 'react';
import { cancelProviderLink, linkProvider } from '../../../api/providers';
import { useMutationState } from '../../../store/mutation';
import { useProviderLink } from '../../../store/selectors';
import { stageOf, type SentLink } from '../../connections';
import { linkProgressOf, type LinkProgress } from './direct-link';

export interface DirectLinking {
  readonly progress: LinkProgress;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly link: (host: string) => void;
  readonly again: () => void;
  readonly stop: () => void;
}

export function useDirectLink(deviceId: string): DirectLinking {
  const row = useProviderLink('samsung_tv');
  const [sent, setSent] = useState<SentLink | null>(null);
  const mutation = useMutationState();
  const link = (host: string): void => {
    setSent({ baseline: row?.updated_at ?? null });
    mutation.run(
      () =>
        linkProvider({ provider: 'samsung_tv', host, attachTo: deviceId }).catch(
          (error: unknown) => {
            setSent(null);
            throw error;
          },
        ),
      { failure: 'Linking did not start', inline: true },
    );
  };
  const stop = (): void => {
    mutation.run(() => cancelProviderLink('samsung_tv'), {
      failure: 'Linking did not stop',
      inline: true,
    });
  };
  return {
    progress: linkProgressOf(stageOf(row, sent)),
    busy: mutation.busy,
    problem: mutation.problem,
    link,
    again: (): void => {
      setSent(null);
    },
    stop,
  };
}
