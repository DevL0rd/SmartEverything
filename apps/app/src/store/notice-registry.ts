import type { QueryClient } from '@tanstack/react-query';
import type { LiveMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import type { EntityStore } from './entity-store';

const log = new Logger('app.store');
const routed = new LogTally(log, 'notices.summarised', 5000);

export type LiveNotice = Exclude<
  LiveMessage,
  { type: 'change' | 'subscribed' | 'profile_changed' }
>;

type NoticeType = LiveNotice['type'];

export type NoticeOf<K extends NoticeType> = Extract<LiveNotice, { readonly type: K }>;

interface NoticeContext {
  readonly client: QueryClient;
  readonly store: EntityStore;
  readonly live: boolean;
}

export interface NoticeHandler {
  readonly types: readonly NoticeType[];
  readonly receive: (message: LiveNotice, context: NoticeContext) => void;
}

class DuplicateNoticeHandlerError extends Error {
  override readonly name = 'DuplicateNoticeHandlerError';

  constructor(readonly type: NoticeType) {
    super(`Two handlers are registered for the ${type} notice; each notice has exactly one.`);
  }
}

function isNoticeOf<K extends NoticeType>(
  types: readonly K[],
  message: LiveNotice,
): message is NoticeOf<K> {
  return types.some((type) => type === message.type);
}

export function noticeHandler<K extends NoticeType>(
  types: readonly K[],
  handle: (message: NoticeOf<K>, context: NoticeContext) => void,
): NoticeHandler {
  return {
    types,
    receive: (message, context): void => {
      if (isNoticeOf(types, message)) handle(message, context);
    },
  };
}

export function noticeRouter(
  handlers: readonly NoticeHandler[],
  context: Pick<NoticeContext, 'client' | 'store'>,
): (message: LiveNotice, live: boolean) => boolean {
  const byType = new Map<NoticeType, NoticeHandler>();
  for (const handler of handlers)
    for (const type of handler.types) {
      if (byType.has(type)) throw new DuplicateNoticeHandlerError(type);
      byType.set(type, handler);
    }
  return (message, live): boolean => {
    const handler = byType.get(message.type);
    if (handler === undefined) {
      routed.bump(`unrouted.${message.type}`);
      return false;
    }
    routed.bump(`routed.${message.type}`);
    try {
      handler.receive(message, { ...context, live });
    } catch (error) {
      log.error('notice.handler_failed', error, { type: message.type, live });
      throw error;
    }
    return true;
  };
}
