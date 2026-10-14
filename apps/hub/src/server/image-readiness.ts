import { ApiError, type ImageProviderReadiness } from '@smarteverything/domain';
import type { ImageActor } from '../assistant/image/contract';
import type { ImageOperationService } from '../assistant/image/service';
import { BudgetStopError } from '../ledger/budget';
import { ImageAdmissionError } from './image-admission';

export function imageReadiness(
  service: ImageOperationService,
  configured: boolean,
  actor: ImageActor,
  chatId: string | undefined,
): ImageProviderReadiness {
  const availability = service.availability();
  const base = {
    configured,
    spend_granted: false,
    ready: false,
    active: availability.active,
    capacity: availability.capacity,
  };
  if (chatId === undefined)
    return {
      ...base,
      reason: 'chat_required',
      detail: 'Select an owned chat to check its metered image-provider grant.',
    };
  actor.authorize('read', chatId);
  const refused = imageRefusal(actor, chatId);
  if (refused !== null)
    return { ...base, spend_granted: refused.reason === 'not_configured', ...refused };
  if (!availability.accepting)
    return {
      ...base,
      spend_granted: true,
      reason: 'service_stopping',
      detail: 'The image service is stopping.',
    };
  if (availability.rasterIssue !== null)
    return {
      ...base,
      spend_granted: true,
      reason: 'catalog_unavailable',
      detail: availability.rasterIssue,
    };
  if (availability.active >= availability.capacity)
    return {
      ...base,
      spend_granted: true,
      reason: 'busy',
      detail: 'Two image operations are active. Wait for one to finish.',
    };
  return { ...base, spend_granted: true, ready: true, reason: null, detail: null };
}

function imageRefusal(
  actor: ImageActor,
  chatId: string,
): Pick<ImageProviderReadiness, 'reason' | 'detail'> | null {
  try {
    actor.authorize('provider', chatId);
    return null;
  } catch (cause) {
    if (cause instanceof ImageAdmissionError)
      return { reason: cause.reason, detail: cause.message };
    if (cause instanceof BudgetStopError)
      return {
        reason: 'budget_blocked',
        detail: 'The current AI budget has paused background image spending.',
      };
    if (cause instanceof ApiError)
      return {
        reason: 'authority_revoked',
        detail: 'The current execution or spending authority does not admit this image operation.',
      };
    throw cause;
  }
}
