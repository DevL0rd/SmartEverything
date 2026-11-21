import type { AiChatRow } from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';

export interface NativeForkPlan {
  readonly session_id: string;
  readonly checkpoint: number;
  readonly boundary: number;
}

export function recordNativeFork(store: HostStore, plan: NativeForkPlan, child: AiChatRow): void {
  const operation = `fork:${child.id}`;
  const request = { kind: 'fork', boundary: plan.boundary };
  store.harnessSessions.begin(operation, plan.session_id, request);
  store.harnessRecovery.fork(child.id, plan.session_id, plan.checkpoint);
  store.harnessSessions.finish(operation, request);
}
