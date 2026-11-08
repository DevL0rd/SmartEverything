import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { Logger } from '@smarteverything/logging';
import type { HarnessControlPersistence } from './contracts';
import {
  HELPER_SETTLEMENT_PROOF,
  HELPER_SETTLEMENT_PROOF_DATA,
} from '../host/helper-settlement-proof';

interface Active {
  readonly parent: Agent;
  readonly child: Agent;
  readonly epoch: number;
}

const log = new Logger('hub.harness');

export function recordHelperSettlement(ctx: Context, persistence: HarnessControlPersistence): void {
  const activations = new Map<string, Active>();
  ctx.on(
    'subagent/start',
    (info) => {
      if (!info.local) return;
      const child = ctx.agents.get(info.id);
      const parentId = child?.session.header.parentSession;
      const claim = persistence.boundClaim(info.id);
      if (child === undefined || parentId === undefined || claim === undefined) return;
      const parent = ctx.agents.get(parentId);
      if (parent !== undefined) activations.set(info.runId, { parent, child, epoch: claim.epoch });
    },
    { global: true },
  );
  ctx.on(
    'subagent/end',
    (info) => {
      const active = activations.get(info.runId);
      activations.delete(info.runId);
      if (active === undefined || info.stopReason !== 'completed') return;
      const { parent, child, epoch } = active;
      if (ctx.agents.get(parent.id) !== parent || persistence.boundClaim(child.id)?.epoch !== epoch)
        return;
      appendPluginRecord(
        parent.session,
        HELPER_SETTLEMENT_PROOF,
        HELPER_SETTLEMENT_PROOF_DATA.parse({
          childSessionId: child.id,
          writerEpoch: epoch,
          nextSeq: child.session.seq,
        }),
      );
      void ctx.sessions.flush(parent.session).catch((cause: unknown) => {
        log.error('helper_settlement.flush_failed', cause, { session_id: parent.id });
      });
    },
    { global: true },
  );
}
