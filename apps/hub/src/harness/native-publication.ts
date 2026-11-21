import { ApiError } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import type { HarnessService } from './service';

export async function acceptPublication(
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<{ readonly ok: true }> {
  const request = input.request;
  if (request.operation !== 'publish')
    throw new ApiError('invalid_request', 'Expected a native publication.');
  const publication = request.frame;
  if (publication.type === 'harness_subscription_status') {
    service.subscriptions.frame(publication);
    return { ok: true };
  }
  if (publication.type === 'harness_subscription_routes') {
    service.subscriptions.reported(publication);
    return { ok: true };
  }
  const frame = publication.frame;
  await service.storage.principal(frame.session_id, input);
  if (
    (await service.store.host.call('harnessSessions', 'state', frame.session_id))?.epoch !==
    frame.epoch
  )
    throw new ApiError(
      'forbidden',
      'The native frame does not belong to this profile or writer epoch.',
    );
  await service.native(frame);
  return { ok: true };
}
