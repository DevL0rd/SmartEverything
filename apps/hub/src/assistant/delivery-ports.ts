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
  readonly coordination: () => { readonly admit: (event: StoredEvent) => boolean };
  readonly ended: (event: StoredEvent, text: string, ok: boolean) => void;
}): Pick<DeliveryOptions, 'admit' | 'delivered' | 'failed' | 'retrying' | 'stopped'> {
  const { options, conversation, ended } = deps;
  const publish = (): void => {
    deps.publisher.publish();
  };
  return {
    admit: (event) => deps.coordination().admit(event),
    delivered: (event): void => {
      conversation.delivered(event.id);
      publish();
    },
    failed: (event, reason): void => {
      conversation.failed(event, reason);
      ended(event, reason, false);
      publish();
    },
    retrying: (event, active): void => {
      options.emit(retryNotice(event, active), event.profile_id);
    },
    stopped: (event): void => {
      conversation.failedMessage(event.message_id, STOPPED_BY_USER, 'stopped');
      ended(event, STOPPED_BY_USER, false);
      publish();
    },
  };
}
