import type { Context } from '@deepseek-ai/cordis';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HarnessRuntimeEvent } from './events';

export function observeCompactionContext(
  ctx: Context,
  emit: (event: HarnessRuntimeEvent) => void,
): void {
  const log = new Logger('hub.harness');
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'compaction/end' || event.data.error !== undefined) return;
    let estimate: number | null = null;
    try {
      estimate = z.int().nonnegative().parse(ctx.tokenMeter.measure(session).totalTokens);
    } catch (cause) {
      log.error('context.estimate_unavailable', cause, { session_id: session.id });
    }
    emit({ kind: 'context', sessionId: session.id, estimate });
  });
}
