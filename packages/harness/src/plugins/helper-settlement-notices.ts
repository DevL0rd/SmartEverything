import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { directedHelperTurns } from '../host/helper-turn-inputs';

const TURN = z.object({ turn: z.int() });
const CLAIM = z.object({
  removedCount: z.int().positive(),
  inserted: z.array(z.unknown()).length(0),
  outcome: z.undefined().optional(),
});

type Selection =
  { readonly kind: 'omit' } | { readonly kind: 'select'; readonly events: readonly SessionEvent[] };

function settlementNotice(events: readonly SessionEvent[]): Selection | undefined {
  const directed = directedHelperTurns(events);
  if (directed.size === 0) return undefined;
  const ordinary: SessionEvent[] = [];
  let reporting = false;
  for (const event of events) {
    if (event.type === 'turn/start') reporting = !directed.has(TURN.parse(event.data).turn);
    if (reporting && (event.type !== 'agent/inbox/spliced' || CLAIM.safeParse(event.data).success))
      ordinary.push(event);
    if (event.type === 'turn/end') reporting = false;
  }
  return ordinary.length === 0 ? { kind: 'omit' } : { kind: 'select', events: ordinary };
}

export function omitDirectedSettlementNotices(ctx: Context): void {
  ctx.on('subagent/settlement-notice', settlementNotice);
}
