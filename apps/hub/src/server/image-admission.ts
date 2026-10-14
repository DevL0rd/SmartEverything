import { ApiError, type ImageProviderReadiness } from '@smarteverything/domain';
export class ImageAdmissionError extends ApiError {
  constructor(
    readonly reason: Exclude<ImageProviderReadiness['reason'], null>,
    detail: string,
  ) {
    super('forbidden', detail);
  }
}
