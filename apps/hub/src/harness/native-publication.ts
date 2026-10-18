import { ApiError } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import type { HarnessService } from './service';

export function acceptPublication(
  service: HarnessService,
  input: HarnessTransportRequest,
): { readonly ok: true } {
  const request = input.request;
  if (request.operation !== 'publish')
    throw new ApiError('invalid_request', 'Expected a native publication.');
  const publication = request.frame;
  if (publication.type === 'harness_subscription_status') {
    service.subscriptions.frame(publication);
    return { ok: true };
  }
  const frame = publication.frame;
  service.storage.principal(frame.session_id, input);
  if (service.store.harnessCoordination.state(frame.session_id)?.epoch !== frame.epoch)
    throw new ApiError(
      'forbidden',
      'The native frame does not belong to this profile or writer epoch.',
    );
  service.native(frame);
  return { ok: true };
}
