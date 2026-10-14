import { useState } from 'react';
import type { StoredKind } from '../../api/transport';
import { PairingPresentation } from './pairing-actions';
import { usePairingLifecycle } from './pairing-lifecycle';

export function usePairing(kind: StoredKind, fixedUrl: string | null): PairingPresentation {
  const [pairing] = useState(() => new PairingPresentation(kind, fixedUrl));
  usePairingLifecycle(pairing);
  return pairing;
}
