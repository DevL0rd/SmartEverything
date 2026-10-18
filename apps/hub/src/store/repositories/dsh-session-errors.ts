export class DshSessionStorageError extends Error {
  override readonly name = 'DshSessionStorageError';
  constructor(
    readonly sessionId: string,
    readonly code: 'ownership-lost' | 'forbidden' | 'sequence' | 'receipt' | 'corruption',
    readonly reason: string,
  ) {
    super(`Native session ${sessionId}: ${reason}.`);
  }
}

export class DshSessionDurabilityError extends Error {
  override readonly name = 'DshSessionDurabilityError';
  constructor(readonly reason: string) {
    super(`Native session durability refused: ${reason}.`);
  }
}
