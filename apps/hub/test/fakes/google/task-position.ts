const POSITION_WIDTH = 20;
export const POSITION_STEP = 1_000_000n;

export function formatPosition(value: bigint): string {
  return value.toString().padStart(POSITION_WIDTH, '0');
}

export function positionValue(position: string): bigint {
  return BigInt(position);
}

export function positionBetween(lower: bigint | null, upper: bigint | null): bigint | null {
  if (lower === null) {
    if (upper === null) return POSITION_STEP;
    return upper > 1n ? upper / 2n : null;
  }
  if (upper === null) return lower + POSITION_STEP;
  const middle = (lower + upper) / 2n;
  return middle > lower ? middle : null;
}

export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
