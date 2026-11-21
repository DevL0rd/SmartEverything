import type { RunBookkeeping } from '../store/repositories/automation-programs';
import { storeUnit } from '../store/host/unit';
import { recordSlice, type RunSlice } from './run-ledger';

export const RECORD_RUN_SLICE_UNIT = storeUnit((store, slice: RunSlice): void => {
  recordSlice(store.automationRunNodes, slice);
});

export const NOTE_AUTOMATION_RUN_UNIT = storeUnit(
  (
    store,
    { automationId, run }: { readonly automationId: string; readonly run: RunBookkeeping },
  ): void => {
    if (store.automations.find(automationId) !== undefined)
      store.automations.recordRun(automationId, run);
  },
);
