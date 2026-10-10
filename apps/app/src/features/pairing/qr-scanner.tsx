import type { ReactNode } from 'react';
import { pairingFromScan, type PairingTarget } from '../../api/pairing-input';
import { CodeScanner } from '../../components/code-scanner';

const QR_ONLY = ['qr'] as const;

export function QrScanner({
  onTarget,
  onClose,
}: {
  readonly onTarget: (target: PairingTarget) => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <CodeScanner
      types={QR_ONLY}
      hint="Point at the code on your desktop"
      purpose="It is used only to read the pairing code."
      shape="square"
      read={(data) => {
        const input = pairingFromScan(data);
        if (!input.ok) {
          return input.problem;
        }
        onTarget(input.target);
        return null;
      }}
      onClose={onClose}
    />
  );
}
