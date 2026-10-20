import type { AutomationRowV3 } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { ServerContext } from './context';
import { wireAutomationTrace } from './automation-trace-wiring';

function authorOf(context: ServerContext, automationId: string): AutomationRowV3['author'] {
  return context.store.automations.find(automationId)?.author ?? null;
}

function automationOfRun(context: ServerContext, runId: string): string | null {
  try {
    return context.store.automationRunRecords.byId(runId).automation_id;
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return null;
    throw cause;
  }
}

export function attachAutomationTrace(context: ServerContext, now: () => Date): () => void {
  const { store, hub, live } = context;
  const wiring = wireAutomationTrace({
    live,
    viewers: hub.drivers.viewers,
    owners: {
      authorOf: (automationId) => authorOf(context, automationId),
      automationOfRun: (runId) => automationOfRun(context, runId),
    },
    store,
    records: store.automationRunRecords,
    nodes: store.automationRunNodes,
    now: () => now().toISOString(),
  });
  const release = hub.automationTrace.attach(wiring.trace);
  return (): void => {
    release();
    wiring.detach();
  };
}
