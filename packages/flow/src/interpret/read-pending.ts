export interface ReadPending {
  readonly pending: true;
}

export const READ_PENDING: ReadPending = { pending: true };

export class ReadSuspended extends Error {
  override readonly name = 'ReadSuspended';

  constructor(readonly kind: string) {
    super(`The read ${kind} is still being fetched.`);
  }
}
