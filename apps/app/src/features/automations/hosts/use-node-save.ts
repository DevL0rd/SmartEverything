import { useState } from 'react';
import type {
  AutomationFunctionDetail,
  AutomationFunctionMapping,
  AutomationFunctionReply,
} from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { useFunctionActions, type FunctionActions } from '../data/use-functions';
import type { DocumentStore } from '../model/editor/document-store';

const log = new Logger('app.automations');

export interface NodeSave {
  readonly breaking: AutomationFunctionReply | null;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly start: () => void;
  readonly keep: () => void;
  readonly updateAll: (mapping: AutomationFunctionMapping) => void;
  readonly close: () => void;
}

interface SaveInput {
  readonly detail: AutomationFunctionDetail;
  readonly store: DocumentStore;
  readonly name: string;
  readonly actions: FunctionActions;
}

async function persist(
  input: SaveInput,
  confirmBreaking: boolean,
): Promise<AutomationFunctionReply | null> {
  const { detail, store, name, actions } = input;
  const snapshot = store.beginSave();
  if (snapshot.program.kind !== 'function') {
    store.finishSave(snapshot.version, false);
    return null;
  }
  try {
    const reply = await actions.save(detail.id, {
      definition: snapshot.program,
      layout: snapshot.layout,
      name,
      expectedRevision: detail.revision,
      confirmBreaking,
    });
    store.finishSave(snapshot.version, reply.ok);
    return reply;
  } catch (error) {
    store.finishSave(snapshot.version, false);
    throw error;
  }
}

interface Flow {
  readonly setBreaking: (reply: AutomationFunctionReply | null) => void;
  readonly setFailure: (failure: string | null) => void;
}

async function firstSave(input: SaveInput, flow: Flow): Promise<void> {
  const reply = await persist(input, false);
  if (reply === null) return;
  if (reply.ok) notify({ message: reply.summary, tone: 'positive' });
  else if (reply.compat === 'breaking') flow.setBreaking(reply);
  else notify({ message: reply.summary, tone: 'critical' });
}

async function keepCallers(input: SaveInput, flow: Flow): Promise<void> {
  const reply = await persist(input, true);
  if (reply === null) return;
  notify({ message: reply.summary, tone: reply.ok ? 'positive' : 'critical' });
  if (reply.ok) flow.setBreaking(null);
}

async function updateCallers(
  input: SaveInput,
  flow: Flow,
  mapping: AutomationFunctionMapping,
): Promise<void> {
  const saved = await persist(input, true);
  if (saved === null) return;
  if (!saved.ok) {
    flow.setFailure(saved.summary);
    return;
  }
  const callers = await input.actions.updateCallers(input.detail.id, { mapping });
  if (!callers.ok) {
    flow.setFailure(callers.summary);
    return;
  }
  flow.setFailure(null);
  flow.setBreaking(null);
  notify({ message: callers.summary, tone: 'positive' });
}

export function useNodeSave(
  detail: AutomationFunctionDetail,
  store: DocumentStore,
  name: string,
): NodeSave {
  const actions = useFunctionActions();
  const [breaking, setBreaking] = useState<AutomationFunctionReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const input: SaveInput = { detail, store, name, actions };
  const flow: Flow = { setBreaking, setFailure };
  const run = (work: Promise<void>, label: string): void => {
    setBusy(true);
    background(
      work
        .catch((error: unknown) => {
          log.error('automations.save_node_failed', error);
          notify({ message: 'The Custom Node wasn’t saved', tone: 'critical', error });
        })
        .finally(() => {
          setBusy(false);
        }),
      label,
    );
  };
  return {
    breaking,
    busy,
    failure,
    start: (): void => {
      run(firstSave(input, flow), 'automations.save_node');
    },
    keep: (): void => {
      run(keepCallers(input, flow), 'automations.keep_callers');
    },
    updateAll: (mapping): void => {
      run(updateCallers(input, flow, mapping), 'automations.update_callers');
    },
    close: (): void => {
      setBreaking(null);
      setFailure(null);
    },
  };
}
