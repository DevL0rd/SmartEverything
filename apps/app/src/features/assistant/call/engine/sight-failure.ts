import type { AppSightSource, SightRefusal } from '@smarteverything/domain';

export class SightStartError extends Error {
  override readonly name = 'SightStartError';

  constructor(
    readonly source: AppSightSource,
    readonly refusal: SightRefusal,
    readonly detail: string,
  ) {
    super(`${source} could not start (${refusal}): ${detail}`);
  }
}
