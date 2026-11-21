import { background } from '@smarteverything/logging';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { ConversationLog } from './conversation-log';
import { STOPPED_BY_USER } from './interruption';
import { retryNotice } from './retry-notice';
import type { AssistantServiceOptions } from './service-contract';
import type { DeliveryOptions } from './delivery';

export function deliveryPorts(deps: {
  readonly options: Pick<AssistantServiceOptions, 'emit'>;
  readonly conversation: ConversationLog;
  readonly publisher: { readonly publish: () => void };
  readonly delegation: () => { readonly admit: (event: StoredEvent) => boolean };
  readonly ended: (event: StoredEvent, text: string, ok: boolean) => void;
}): Pick<DeliveryOptions, 'admit' | 'delivered' | 'failed' | 'retrying' | 'stopped'> {
  const { options, conversation, ended } = deps;
  const publish = (): void => {
    deps.publisher.publish();
  };
  return {
    admit: (event) => deps.delegation().admit(event),
    delivered: (event): void => {
      background(
        conversation.delivered(event.id).then(publish),
        'delivery.delivered_record_failed',
        {
          eventId: event.id,
        },
      );
    },
    failed: (event, reason): void => {
      background(
        conversation.failed(event, reason).then(publish),
        'delivery.failure_record_failed',
        {
          eventId: event.id,
        },
      );
      ended(event, reason, false);
    },
    retrying: (event, active): void => {
      options.emit(retryNotice(event, active), event.profile_id);
    },
    stopped: (event): void => {
      background(
        conversation.failed(event, STOPPED_BY_USER, 'stopped').then(publish),
        'delivery.stop_record_failed',
        { eventId: event.id },
      );
      ended(event, STOPPED_BY_USER, false);
    },
  };
}
