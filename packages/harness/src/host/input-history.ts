import type { Context } from '@deepseek-ai/cordis';
import { Session, SessionLogOffset, SessionPreparation } from '@deepseek-ai/dsh-session';
import type { DshSessionMetadata } from '@smarteverything/domain';
import { nativeEvents, nativeHeader } from '../persistence/validation';
import { HarnessRuntimeError } from './errors';
export interface NativeInputHistory {
  readonly metadata: DshSessionMetadata;
  readonly events: unknown;
}
export function nativePendingInput(ctx: Context, input: NativeInputHistory): readonly string[] {
  const header = nativeHeader(input.metadata.header);
  const preparation = SessionPreparation.create(
    Session.create(
      header.id,
      nativeEvents(header, input.events),
      header,
      SessionLogOffset(input.metadata.inherited_event_count),
    ),
  );
  try {
    const inbox = ctx.sessionProjections.stateOf(preparation.session, 'inbox');
    if (inbox === undefined)
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'The native inbox projection is unavailable.',
      );
    return [...inbox['next-turn'], ...inbox['next-step']].map((message) => message.id);
  } finally {
    preparation[Symbol.dispose]();
  }
}
