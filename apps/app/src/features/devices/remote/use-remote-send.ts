import { useState } from 'react';
import { background } from '@smarteverything/logging';
import { failureText } from './remote-lines';
import type { RemoteSource } from './remote-source';

export interface RemoteSend {
  readonly press: (key: string) => void;
  readonly failure: string | null;
}

export function useRemoteSend(source: RemoteSource): RemoteSend {
  const [failure, setFailure] = useState<string | null>(null);
  return {
    failure,
    press: (key): void => {
      background(
        source.send(key).then((sent) => {
          setFailure(sent ? null : failureText(source.online, source.blasterName));
        }),
        'remote.send_failed',
      );
    },
  };
}
