export interface HubEntry {
  readonly rev: number;
  readonly deleted: boolean;
  readonly content: string;
  readonly seq: number;
}

export type SyncResult =
  | { readonly kind: 'accept'; readonly rev: number }
  | { readonly kind: 'conflict'; readonly hubRev: number; readonly conflictPath: string | null };

export interface PushOp {
  readonly kind: 'push';
  readonly opId: string;
  readonly path: string;
  readonly baseRev: number | null;
  readonly content: string;
}

export interface MoveOp {
  readonly kind: 'move';
  readonly opId: string;
  readonly from: string;
  readonly to: string;
  readonly baseRev: number;
}

export interface TombstoneOp {
  readonly kind: 'tombstone';
  readonly opId: string;
  readonly path: string;
  readonly baseRev: number;
}

export type SyncOp = PushOp | MoveOp | TombstoneOp;

export interface HubState {
  readonly seq: number;
  readonly entries: ReadonlyMap<string, HubEntry>;
  readonly results: ReadonlyMap<string, SyncResult>;
}

export interface SyncContext {
  readonly device: string;
  readonly at: number;
}

export interface ApplyOutcome {
  readonly state: HubState;
  readonly result: SyncResult;
}

export interface ClientBase {
  readonly rev: number;
  readonly content: string;
}

export interface RenameHint {
  readonly from: string;
  readonly to: string;
}

export type PushDecision = 'accept' | 'noop' | 'conflict';
export type TombstoneDecision = 'accept' | 'noop' | 'stale';
export type MoveDecision = 'accept' | 'conflict';

export const EMPTY_HUB: HubState = { seq: 0, entries: new Map(), results: new Map() };

export function decidePush(
  entry: HubEntry | undefined,
  baseRev: number | null,
  content: string,
): PushDecision {
  if (entry === undefined || entry.deleted) return 'accept';
  if (entry.content === content) return 'noop';
  return baseRev !== null && entry.rev === baseRev ? 'accept' : 'conflict';
}

export function decideTombstone(entry: HubEntry | undefined, baseRev: number): TombstoneDecision {
  if (entry === undefined || entry.deleted) return 'noop';
  return entry.rev === baseRev ? 'accept' : 'stale';
}

export function decideMove(
  from: HubEntry | undefined,
  to: HubEntry | undefined,
  op: Pick<MoveOp, 'from' | 'to' | 'baseRev'>,
): MoveDecision {
  if (op.from === op.to) return 'conflict';
  if (from === undefined || from.deleted || from.rev !== op.baseRev) return 'conflict';
  return to === undefined || to.deleted ? 'accept' : 'conflict';
}

export function sanitizeDevice(device: string): string {
  const clean = device.replace(/[^A-Za-z0-9]/g, '');
  if (clean === '') throw new RangeError('device name has no usable characters');
  return clean;
}

function stamp(at: number): string {
  const iso = new Date(at).toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

export function conflictName(path: string, at: number, device: string): string {
  const slash = path.lastIndexOf('/') + 1;
  const dir = path.slice(0, slash);
  const name = path.slice(slash);
  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && dot < name.length - 1;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  return `${dir}${base}.sync-conflict-${stamp(at)}-${sanitizeDevice(device)}${ext}`;
}

export function uniqueConflictPath(
  path: string,
  at: number,
  device: string,
  isTaken: (candidate: string) => boolean,
): string {
  let candidate = conflictName(path, at, device);
  for (let step = 1; isTaken(candidate); step += 1) {
    candidate = conflictName(path, at + step * 1000, device);
  }
  return candidate;
}

export type SyncOpBody = Omit<PushOp, 'opId'> | Omit<MoveOp, 'opId'> | Omit<TombstoneOp, 'opId'>;

export function operationId(device: string, op: SyncOpBody): string {
  const parts =
    op.kind === 'push'
      ? [op.path, String(op.baseRev), op.content]
      : op.kind === 'move'
        ? [op.from, op.to, String(op.baseRev)]
        : [op.path, String(op.baseRev)];
  return JSON.stringify([device, op.kind, ...parts]);
}

function putEntry(
  state: HubState,
  path: string,
  fields: Pick<HubEntry, 'deleted' | 'content'>,
): { readonly state: HubState; readonly rev: number } {
  const rev = (state.entries.get(path)?.rev ?? 0) + 1;
  const seq = state.seq + 1;
  const entries = new Map(state.entries).set(path, { rev, seq, ...fields });
  return { state: { ...state, seq, entries }, rev };
}

function remember(state: HubState, opId: string, result: SyncResult): HubState {
  return { ...state, results: new Map(state.results).set(opId, result) };
}

function accepted(state: HubState, rev: number): ApplyOutcome {
  return { state, result: { kind: 'accept', rev } };
}

function stashConflict(
  state: HubState,
  op: PushOp,
  ctx: SyncContext,
  hubRev: number,
): ApplyOutcome {
  const copy = uniqueConflictPath(op.path, ctx.at, ctx.device, (name) => state.entries.has(name));
  const written = putEntry(state, copy, { deleted: false, content: op.content });
  return { state: written.state, result: { kind: 'conflict', hubRev, conflictPath: copy } };
}

function applyPush(state: HubState, op: PushOp, ctx: SyncContext): ApplyOutcome {
  const entry = state.entries.get(op.path);
  const decision = decidePush(entry, op.baseRev, op.content);
  if (decision === 'noop') return accepted(state, entry?.rev ?? 0);
  if (decision === 'conflict') return stashConflict(state, op, ctx, entry?.rev ?? 0);
  const written = putEntry(state, op.path, { deleted: false, content: op.content });
  return accepted(written.state, written.rev);
}

function applyTombstone(state: HubState, op: TombstoneOp): ApplyOutcome {
  const entry = state.entries.get(op.path);
  const decision = decideTombstone(entry, op.baseRev);
  if (decision === 'noop') return accepted(state, entry?.rev ?? 0);
  if (entry === undefined || decision === 'stale') {
    return { state, result: { kind: 'conflict', hubRev: entry?.rev ?? 0, conflictPath: null } };
  }
  const written = putEntry(state, op.path, { deleted: true, content: entry.content });
  return accepted(written.state, written.rev);
}

function applyMove(state: HubState, op: MoveOp): ApplyOutcome {
  const from = state.entries.get(op.from);
  if (decideMove(from, state.entries.get(op.to), op) === 'conflict' || from === undefined) {
    return { state, result: { kind: 'conflict', hubRev: from?.rev ?? 0, conflictPath: null } };
  }
  const removed = putEntry(state, op.from, { deleted: true, content: from.content });
  const created = putEntry(removed.state, op.to, { deleted: false, content: from.content });
  return accepted(created.state, created.rev);
}

export function applyOp(state: HubState, op: SyncOp, ctx: SyncContext): ApplyOutcome {
  const known = state.results.get(op.opId);
  if (known !== undefined) return { state, result: known };
  const outcome =
    op.kind === 'push'
      ? applyPush(state, op, ctx)
      : op.kind === 'move'
        ? applyMove(state, op)
        : applyTombstone(state, op);
  return { state: remember(outcome.state, op.opId, outcome.result), result: outcome.result };
}

export function entriesAfter(
  state: HubState,
  afterSeq: number,
): readonly (readonly [string, HubEntry])[] {
  return [...state.entries].filter(([, entry]) => entry.seq > afterSeq);
}

function planMoves(
  device: string,
  base: ReadonlyMap<string, ClientBase>,
  local: ReadonlyMap<string, string>,
  renames: readonly RenameHint[],
): readonly MoveOp[] {
  const moves: MoveOp[] = [];
  for (const { from, to } of renames) {
    const source = base.get(from);
    const valid =
      source !== undefined &&
      !local.has(from) &&
      !base.has(to) &&
      local.get(to) === source.content &&
      !moves.some((move) => move.to === to);
    if (valid) {
      const op = { kind: 'move', from, to, baseRev: source.rev } as const;
      moves.push({ ...op, opId: operationId(device, op) });
    }
  }
  return moves;
}

function planPushes(
  device: string,
  base: ReadonlyMap<string, ClientBase>,
  local: ReadonlyMap<string, string>,
  moved: ReadonlySet<string>,
): readonly PushOp[] {
  const pushes: PushOp[] = [];
  for (const [path, content] of local) {
    const known = base.get(path);
    if (moved.has(path) || known?.content === content) continue;
    const op = { kind: 'push', path, baseRev: known?.rev ?? null, content } as const;
    pushes.push({ ...op, opId: operationId(device, op) });
  }
  return pushes;
}

function planTombstones(
  device: string,
  base: ReadonlyMap<string, ClientBase>,
  local: ReadonlyMap<string, string>,
  moved: ReadonlySet<string>,
): readonly TombstoneOp[] {
  const tombstones: TombstoneOp[] = [];
  for (const [path, known] of base) {
    if (local.has(path) || moved.has(path)) continue;
    const op = { kind: 'tombstone', path, baseRev: known.rev } as const;
    tombstones.push({ ...op, opId: operationId(device, op) });
  }
  return tombstones;
}

export function planOps(
  device: string,
  base: ReadonlyMap<string, ClientBase>,
  local: ReadonlyMap<string, string>,
  renames: readonly RenameHint[],
): readonly SyncOp[] {
  const moves = planMoves(device, base, local, renames);
  const moved = new Set(moves.flatMap((move) => [move.from, move.to]));
  return [
    ...moves,
    ...planPushes(device, base, local, moved),
    ...planTombstones(device, base, local, moved),
  ];
}

export function fallbackForMove(
  device: string,
  op: MoveOp,
  content: string,
): readonly [PushOp, TombstoneOp] {
  const create = { kind: 'push', path: op.to, baseRev: null, content } as const;
  const remove = { kind: 'tombstone', path: op.from, baseRev: op.baseRev } as const;
  return [
    { ...create, opId: operationId(device, create) },
    { ...remove, opId: operationId(device, remove) },
  ];
}
