import { encode } from 'uqr';

export interface QrDrawing {
  readonly size: number;
  readonly path: string;
}

const QUIET_ZONE = 2;

export function qrDrawingOf(text: string): QrDrawing {
  const qr = encode(text, { ecc: 'M', border: QUIET_ZONE });
  const path = qr.data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${String(x)} ${String(y)}h1v1h-1z` : '')))
    .join('');
  return { size: qr.size, path };
}
