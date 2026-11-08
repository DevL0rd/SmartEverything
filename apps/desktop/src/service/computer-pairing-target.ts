import type { ComputerNodePairing, DesktopServer } from '@smarteverything/domain';

class ComputerPairingTargetError extends Error {
  override readonly name = 'ComputerPairingTargetError';
}

export function requireEnrolledPairingHub(
  enrolled: DesktopServer | null,
  pairing: ComputerNodePairing,
): DesktopServer {
  const target = new URL(pairing.url);
  if (
    enrolled === null ||
    target.origin !== new URL(enrolled.url).origin ||
    (target.protocol === 'https:' && pairing.pin !== enrolled.connection?.identity.id)
  ) {
    throw new ComputerPairingTargetError(
      'Issue the computer code for this desktop’s enrolled Hub address.',
    );
  }
  return enrolled;
}
