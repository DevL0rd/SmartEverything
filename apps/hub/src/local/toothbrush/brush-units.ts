import type { BrushingSession, ClientRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { StoredHead, StoredHeadWrite } from '../../store/repositories/brushing-sessions';
import type { Store } from '../../store/store';
import type { RetainedDraft } from './brand';
import { homeClock } from './clock';
import { commandRoleOf } from './command-access';
import type { ObservedSession } from './session-machine';
import { BrushingLog, type LogContext, type Logged } from './sessions';

export interface BrushRecords {
  readonly handleIds: number[];
  readonly heads: StoredHead[];
}

export interface BrushLogged extends Logged {
  readonly personName: string | null;
}

export interface BrushSessionsPage {
  readonly deviceId: string;
  readonly personId: string | undefined;
  readonly before: string | undefined;
  readonly limit: number;
  readonly hiddenFor: string | null;
}

export interface BrushPageRead {
  readonly sessions: BrushingSession[];
  readonly hidden: number;
}

function logOf(store: Store): BrushingLog {
  return new BrushingLog({ store, clock: homeClock(store) });
}

function named(store: Store, logged: Logged): BrushLogged {
  const { personId } = logged.session;
  return { ...logged, personName: personId === null ? null : store.profiles.byId(personId).name };
}

export const BRUSH_RECORDS_UNIT = storeUnit((store, deviceId: string): BrushRecords => ({
  handleIds: store.brushingSessions.handleIds(deviceId),
  heads: store.brushingSessions.heads(deviceId),
}));

export const BRUSH_OBSERVED_UNIT = storeUnit(
  (
    store,
    input: { readonly context: LogContext; readonly session: ObservedSession },
  ): BrushLogged => named(store, logOf(store).observed(input.context, input.session)),
);

export const BRUSH_RETAINED_UNIT = storeUnit(
  (store, input: { readonly context: LogContext; readonly draft: RetainedDraft }): BrushLogged =>
    named(store, logOf(store).retained(input.context, input.draft)),
);

export const BRUSH_SAVE_HEAD_UNIT = storeUnit(
  (store, input: { readonly deviceId: string; readonly head: StoredHeadWrite }): StoredHead[] => {
    store.brushingSessions.saveHead(input.deviceId, input.head);
    return store.brushingSessions.heads(input.deviceId);
  },
);

export const BRUSH_PAGE_UNIT = storeUnit((store, request: BrushSessionsPage): BrushPageRead => ({
  sessions: store.brushingSessions.page(request),
  hidden:
    request.hiddenFor === null
      ? 0
      : store.brushingSessions.countHidden(request.deviceId, request.hiddenFor),
}));

export const LOCAL_COMMAND_ROLE_UNIT = storeUnit((store, commandId: string): ClientRow['role'] =>
  commandRoleOf(store, commandId),
);
