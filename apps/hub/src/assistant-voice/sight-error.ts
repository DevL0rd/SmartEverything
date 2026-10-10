import type { SightRefusal } from '@smarteverything/domain';

export class SightError extends Error {
  override readonly name = 'SightError';

  constructor(
    readonly refusal: SightRefusal,
    message: string,
  ) {
    super(message);
  }
}
