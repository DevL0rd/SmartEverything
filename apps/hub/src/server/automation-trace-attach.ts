import type { StoredAutomationRow } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { ServerContext } from './context';
import { wireAutomationTrace } from './automation-trace-wiring';

async function authorOf(
  context: ServerContext,
  automationId: string,
): Promise<StoredAutomationRow['author']> {
  return (await context.store.host.call('automations', 'find', automationId))?.author ?? null;
}

async function automationOfRun(context: ServerContext, runId: string): Promise<string | null> {
  try {
    return (await context.store.host.call('automationRunRecords', 'byId', runId)).automation_id;
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
    profiles: {
      activeProfileOf: async (clientId) =>
        (await store.host.call('profiles', 'activeOf', clientId)).id,
    },
    records: {
      active: (automationId) => store.host.call('automationRunRecords', 'active', automationId),
      byId: (runId) => store.host.call('automationRunRecords', 'byId', runId),
    },
    nodes: { forRun: (runId) => store.host.call('automationRunNodes', 'forRun', runId) },
    now: () => now().toISOString(),
  });
  const release = hub.automationTrace.attach(wiring.trace);
  return (): void => {
    release();
    wiring.detach();
  };
}
