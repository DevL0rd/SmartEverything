import { useState } from 'react';
import type { PublicStatus } from '@smarteverything/domain';
import type { PairingTarget } from '../../api/pairing-input';
import { checkServer, pairWith } from '../../api/transport';
import type { StoredKind } from '../../api/transport';
import { appPlatform } from '../../design/platform';
import { welcome } from './welcome';
import { rawErrorText } from '../../format/errors';

export function defaultDeviceName(kind: StoredKind): string {
  if (kind === 'phone') {
    return 'Android phone';
  }
  return appPlatform() === 'desktop' ? 'Desktop' : 'Browser';
}

export interface Pairing {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly fail: (problem: string) => void;
  readonly pair: (target: PairingTarget, name: string) => void;
}

export function usePairing(kind: StoredKind): Pairing {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return {
    busy,
    problem,
    fail: setProblem,
    pair: (target, name): void => {
      setBusy(true);
      setProblem(null);
      const chosen = name.trim() === '' ? defaultDeviceName(kind) : name.trim();
      welcome.set({ role: null });
      pairWith({ target, name: chosen }).then(
        (client) => {
          welcome.set({ role: client.role });
        },
        (error: unknown) => {
          welcome.set(null);
          setBusy(false);
          setProblem(rawErrorText(error));
        },
      );
    },
  };
}

export type ServerCheck =
  | { readonly state: 'idle' }
  | { readonly state: 'checking' }
  | { readonly state: 'found'; readonly url: string; readonly status: PublicStatus }
  | { readonly state: 'failed'; readonly problem: string };

export function serverCheckOf(url: string, done: (check: ServerCheck) => void): void {
  checkServer(url).then(
    (status) => {
      done({ state: 'found', url, status });
    },
    (error: unknown) => {
      done({
        state: 'failed',
        problem: `No SmartEverything server answered: ${rawErrorText(error)}`,
      });
    },
  );
}
