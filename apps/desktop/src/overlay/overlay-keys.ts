export type TrayKey =
  | { readonly kind: 'close' }
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'none' };

export function trayKeyStep(key: string, shift: boolean, count: number, active: number): TrayKey {
  if (key === 'Escape') {
    return { kind: 'close' };
  }
  if (key !== 'Tab' || count === 0) {
    return { kind: 'none' };
  }
  const step = shift ? -1 : 1;
  const from = active < 0 ? (shift ? 0 : -1) : active;
  return { kind: 'focus', index: (from + step + count) % count };
}
