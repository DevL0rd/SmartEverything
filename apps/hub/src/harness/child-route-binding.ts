import type { Store } from '../store/store';
import type { DshRouteBinding } from '../store/repositories/dsh-session-writes';
import type { HarnessGrant } from './grant';

export function unchangedRoute(grant: HarnessGrant, choice: DshRouteBinding['choice']): boolean {
  return (
    grant.route.route_id === choice.agentProvider &&
    grant.route.model === choice.agentModel &&
    (choice.agentReasoningEffort === undefined ||
      choice.agentReasoningEffort === grant.route.effort)
  );
}

function boundRoute(store: Store, sessionId: string, { choice, route }: DshRouteBinding): void {
  const grant = store.harnessSessions.grant(sessionId);
  if (grant === undefined || unchangedRoute(grant, choice)) return;
  store.harnessSessions.issue({ ...grant, route });
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  const chatId = run?.child_chat_id ?? null;
  if (run === undefined || chatId === null) return;
  const chat = store.aiChats.chat(chatId);
  if (chat.engine.kind !== 'dsh') return;
  store.aiChats.update(chat.id, {
    engine: {
      ...chat.engine,
      model_route_id: route.route_id,
      model: route.model,
      effort: route.effort,
    },
  });
  store.aiAgentRuns.upsert({
    ...run,
    model: route.model,
    effort: route.effort,
    source_seq: run.source_seq + 1,
    ...(run.harness === undefined
      ? {}
      : { harness: { ...run.harness, model_route_id: route.route_id } }),
  });
}

export function bindChildRoutes(
  store: Store,
  sessionId: string,
  routes: readonly DshRouteBinding[],
): void {
  for (const route of routes) boundRoute(store, sessionId, route);
}
