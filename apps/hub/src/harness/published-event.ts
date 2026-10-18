import type { Logger } from '@smarteverything/logging';
import type { AiHarnessEvent, AiHarnessSession } from '@smarteverything/domain';

type StateEvent = Extract<AiHarnessEvent, { kind: 'state' }>;

export function logPublished(log: Logger, event: AiHarnessEvent): void {
  const fields = { chatId: event.chat_id, sessionId: event.session_id };
  switch (event.kind) {
    case 'completed':
      log.info('harness.turn_completed', {
        ...fields,
        epoch: event.epoch,
        interrupted: event.interrupted,
      });
      return;
    case 'failed':
      log.warn('harness.turn_failed', { ...fields, epoch: event.epoch, code: event.failure.code });
      return;
    case 'interaction':
      log.info('harness.interaction_requested', { ...fields, interactionId: event.interaction.id });
      return;
    case 'state':
      log.debug('harness.state_changed', () => ({
        ...fields,
        epoch: event.epoch,
        state: event.session.state,
      }));
      return;
    case 'text':
    case 'reasoning':
    case 'tool':
    case 'agent':
    case 'usage':
      return;
  }
}

export function nextProjection(
  event: AiHarnessEvent,
  session: AiHarnessSession,
  project: (event: StateEvent) => AiHarnessSession,
): AiHarnessSession {
  switch (event.kind) {
    case 'state':
      return project(event);
    case 'interaction':
      return {
        ...session,
        state: 'waiting',
        interactions: [
          ...session.interactions.filter((entry) => entry.id !== event.interaction.id),
          event.interaction,
        ],
      };
    case 'completed':
      return { ...session, state: 'idle', work: [], reconnecting: false, failure: null };
    case 'failed':
      return { ...session, state: 'failed', failure: event.failure, reconnecting: false };
    case 'text':
    case 'reasoning':
    case 'tool':
    case 'agent':
    case 'usage':
      return { ...session, state: 'working' };
  }
}

export function streamedWithoutChange(
  event: AiHarnessEvent,
  prior: AiHarnessSession,
  next: AiHarnessSession,
): boolean {
  return (event.kind === 'text' || event.kind === 'reasoning') && next.state === prior.state;
}
