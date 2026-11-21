import { EMPTY_CLASSIFIER } from '@smarteverything/ble';
import type {
  BottlePushAction,
  BottleReadQuery,
  BottleSyncPlan,
  BottleUvStart,
  BottleView,
  ClientRow,
  DeviceRow,
  WatchBridge,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { UnitNote } from '../unit-notes';
import type { Viewer } from './access';
import { phoneClientsOf } from './phones';
import { entryConfigOf } from './config';
import { actionPlanOf, syncPlanOf } from './plan';
import { rederive } from './rederive';
import { SNAP } from './snapshots';
import { capOf } from './summary';
import { bottleWorkerDeps, planDepsOf, syncBottle, type SyncInput, type SyncOutcome } from './sync';
import type { ViewDeps } from './view-deps';
import { readView } from './views';

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation']);

export interface PlanTargetInput {
  readonly entry: LocalDeviceEntry;
  readonly deviceId: string;
}

export interface ActionPlanInput {
  readonly target: PlanTargetInput;
  readonly holder: string | null;
  readonly action: BottlePushAction;
  readonly uvMode: BottleUvStart | null;
  readonly now: string;
}

export interface ActionPlanRead {
  readonly clientIds: string[];
  readonly plan: BottleSyncPlan;
}

export interface ViewInput {
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly viewer: Viewer;
  readonly query: BottleReadQuery;
  readonly holder: WatchBridge | null;
  readonly syncing: boolean;
  readonly now: string;
}

export interface RederiveOutcome {
  readonly readings: number;
  readonly added: number;
  readonly corrected: number;
  readonly notes: readonly UnitNote[];
}

export interface SyncRead extends SyncOutcome {
  readonly notes: readonly UnitNote[];
}

export const BOTTLE_SYNC_UNIT = storeUnit((store, input: SyncInput): SyncRead => {
  const deps = bottleWorkerDeps(store, input.now);
  return { ...syncBottle(deps, input), notes: deps.log.notes };
});

export const BOTTLE_PLANS_UNIT = storeUnit(
  (
    store,
    input: { readonly targets: readonly PlanTargetInput[]; readonly now: string },
  ): BottleSyncPlan[] => {
    const plan = planDepsOf(bottleWorkerDeps(store, input.now));
    return input.targets.map((target) => syncPlanOf(plan, target));
  },
);

export const BOTTLE_ACTION_PLAN_UNIT = storeUnit(
  (store, input: ActionPlanInput): ActionPlanRead => {
    const config = entryConfigOf(input.target.entry);
    return {
      clientIds: phoneClientsOf(store, config.binding.profileId, input.holder),
      plan: actionPlanOf(
        planDepsOf(bottleWorkerDeps(store, input.now)),
        input.target,
        input.action,
        input.uvMode,
      ),
    };
  },
);

export const BOTTLE_VIEW_UNIT = storeUnit((store, input: ViewInput): BottleView => {
  const worker = bottleWorkerDeps(store, input.now);
  const deps: ViewDeps = {
    store,
    readings: worker.readings,
    logs: worker.logs,
    snapshots: worker.snapshots,
    clock: worker.clock,
    now: worker.now,
    holder: () => input.holder,
    syncing: () => input.syncing,
  };
  return readView({ deps, device: input.device, viewer: input.viewer }, input.entry, input.query);
});

export const BOTTLE_CAP_UNIT = storeUnit(
  (store, input: { readonly deviceId: string; readonly now: string }) =>
    capOf(bottleWorkerDeps(store, input.now), input.deviceId),
);

export const BOTTLE_FORGET_CLASSIFIER_UNIT = storeUnit(
  (store, input: { readonly deviceId: string; readonly now: string }): void => {
    bottleWorkerDeps(store, input.now).snapshots.save(
      input.deviceId,
      SNAP.classifier,
      input.now,
      EMPTY_CLASSIFIER,
    );
  },
);

export const BOTTLE_REDERIVE_UNIT = storeUnit(
  (store, input: { readonly deviceId: string; readonly now: string }): RederiveOutcome => {
    const deps = bottleWorkerDeps(store, input.now);
    const entry = store.localDevices.byExternalId(store.devices.byId(input.deviceId).external_id);
    const done = rederive({ ...deps, drinks: deps }, input.deviceId, entry);
    return { ...done, notes: deps.log.notes };
  },
);

export const BOTTLE_COMMAND_ACTOR_UNIT = storeUnit(
  (store, commandId: string): Pick<Viewer, 'role' | 'profileId'> | null => {
    const row = store.commands.byId(commandId);
    if (OWNER_SOURCES.has(row.source) || row.requested_by === null) {
      return null;
    }
    const client: ClientRow = store.clients.byId(row.requested_by);
    return { role: client.role, profileId: store.profiles.activeOf(client.id).id };
  },
);
