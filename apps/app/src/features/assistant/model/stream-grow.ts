export const GROW_MS = 160;

export function growHeight(smooth: boolean, measured: number | null): number | null {
  return smooth ? measured : null;
}
