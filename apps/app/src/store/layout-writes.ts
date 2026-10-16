import type { LayoutRow, LiveChange } from '@smarteverything/domain';
import { applyChange } from './live-reducers';
import type { LayoutWrite, StoreState } from './state';

export function layoutWriteScope(state: StoreState): string | null {
  const session = state.session;
  return session === null || state.layoutWritesSuspended
    ? null
    : JSON.stringify([
        session.client.id,
        session.client.profile_id,
        session.hub.startedAt,
        state.layoutWriteEpoch,
      ]);
}

function sameLayoutWriteScope(previous: StoreState, next: StoreState): boolean {
  return (
    (previous.session === next.session &&
      previous.layoutWriteEpoch === next.layoutWriteEpoch &&
      previous.layoutWritesSuspended === next.layoutWritesSuspended) ||
    layoutWriteScope(previous) === layoutWriteScope(next)
  );
}

function withWrite(state: StoreState, page: string, write: LayoutWrite | null): StoreState {
  if (state.layoutWrites[page] === write) return state;
  const others = Object.fromEntries(
    Object.entries(state.layoutWrites).filter(([key]) => key !== page),
  );
  return { ...state, layoutWrites: write === null ? others : { ...others, [page]: write } };
}

function withRecord(state: StoreState, page: string, record: LayoutRow | null): StoreState {
  const current = state.tables.layouts.byId[page];
  if (record === null && current === undefined) return state;
  return applyChange(state, {
    type: 'change',
    table: 'layouts',
    operation: record === null ? 'DELETE' : 'UPDATE',
    record,
    oldRecord: current ?? null,
  });
}

export function clearWithdrawnLayoutWrites(previous: StoreState, next: StoreState): StoreState {
  if (sameLayoutWriteScope(previous, next)) return next;
  let state = { ...next, layoutWrites: {} };
  for (const [page, write] of Object.entries(next.layoutWrites)) {
    if (next.tables.layouts.byId[page] === write.record)
      state = withRecord(state, page, write.previous);
  }
  return state;
}

export function beginLayoutWrite(
  state: StoreState,
  record: LayoutRow,
  request: symbol,
  scope: string,
): StoreState {
  const previous = state.layoutWrites[record.page];
  return withWrite(withRecord(state, record.page, record), record.page, {
    request,
    scope,
    record,
    previous:
      previous === undefined ? (state.tables.layouts.byId[record.page] ?? null) : previous.previous,
    observedSeq: previous?.observedSeq ?? state.sync.seq ?? 0,
    confirmedSeq: null,
  });
}

function settleLayoutWrite(state: StoreState, page: string, write: LayoutWrite): StoreState {
  return withRecord(withWrite(state, page, null), page, write.previous);
}

function caughtUp(state: StoreState, write: LayoutWrite): boolean {
  return (
    write.confirmedSeq !== null && state.sync.seq !== null && state.sync.seq >= write.confirmedSeq
  );
}

export function acknowledgeLayoutWrite(
  state: StoreState,
  page: string,
  request: symbol,
  acknowledgement: { readonly scope: string; readonly record: LayoutRow; readonly seq: number },
): StoreState {
  const { scope, record, seq } = acknowledgement;
  const known = state.layoutWrites[page];
  if (known?.scope !== scope || layoutWriteScope(state) !== scope) return state;
  const observed =
    seq > known.observedSeq ? { ...known, previous: record, observedSeq: seq } : known;
  const write = known.request === request ? { ...observed, confirmedSeq: seq } : observed;
  return caughtUp(state, write)
    ? settleLayoutWrite(state, page, write)
    : withWrite(state, page, write);
}

export function refuseLayoutWrite(
  state: StoreState,
  page: string,
  request: symbol,
  scope: string,
): StoreState {
  const write = state.layoutWrites[page];
  return write?.request === request && write.scope === scope
    ? settleLayoutWrite(state, page, write)
    : state;
}

function observedWrite(
  write: LayoutWrite,
  page: string,
  next: StoreState,
  changes: readonly LiveChange[] | null,
): LayoutWrite {
  if (changes === null) {
    const seq = next.sync.seq;
    return seq !== null && seq >= write.observedSeq
      ? { ...write, previous: next.tables.layouts.byId[page] ?? null, observedSeq: seq }
      : write;
  }
  return changes.reduce((current, change) => {
    if (change.table !== 'layouts' || change.seq < current.observedSeq) return current;
    const row = change.record ?? change.oldRecord;
    return row?.page === page
      ? { ...current, previous: change.record, observedSeq: change.seq }
      : current;
  }, write);
}

export function reconcileLayoutWrites(
  previous: StoreState,
  next: StoreState,
  changes: readonly LiveChange[] | null,
): StoreState {
  if (!sameLayoutWriteScope(previous, next)) return { ...next, layoutWrites: {} };
  let state = next;
  for (const [page, known] of Object.entries(previous.layoutWrites)) {
    const write = observedWrite(known, page, next, changes);
    state = withWrite(state, page, write);
    state = caughtUp(next, write)
      ? settleLayoutWrite(state, page, write)
      : withRecord(state, page, write.record);
  }
  return state;
}
