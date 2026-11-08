import type { DrivePlacement, DrivePlacementStatus } from '@smarteverything/domain';
import { z } from 'zod';

const COUNT = z.int().nonnegative();

const HELPER_COUNTERS = {
  cacheBytes: COUNT,
  pinnedBytes: COUNT,
  openFiles: COUNT,
  pendingUploads: COUNT,
} as const;

const HELPER_LINE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('status'),
    mount: z.string().min(1),
    state: z.enum(['mounted', 'stopped', 'failed']),
    reason: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('error'),
    mount: z.string().optional(),
    reason: z.string(),
  }),
  z.strictObject({ type: z.literal('counters'), mount: z.string().min(1), ...HELPER_COUNTERS }),
]);

export type HelperLine = z.infer<typeof HELPER_LINE>;

export function parseHelperLine(raw: string): HelperLine {
  return HELPER_LINE.parse(JSON.parse(raw));
}

export type PlacementFields = Pick<
  DrivePlacementStatus,
  'state' | 'tier' | 'basicLimits' | 'readOnly' | 'route' | 'reason'
>;

export type PlacementCounters = Pick<
  DrivePlacementStatus,
  'cacheBytes' | 'pinnedBytes' | 'openFiles' | 'pendingUploads'
>;

export interface PlacementReport extends DrivePlacementStatus {
  readonly placementId: string;
}

export interface StateSink {
  readonly report: (report: PlacementReport) => void;
  readonly mountsDemanded: () => boolean;
}

export type RouteKind = DrivePlacementStatus['route'];

export interface RouteEndpointState {
  readonly endpoint: { readonly kind: 'loopback' | 'lan' | 'remote' } | null;
}

export function routeKind(state: RouteEndpointState): RouteKind {
  if (state.endpoint === null) return null;
  return state.endpoint.kind === 'remote' ? 'remote' : 'local';
}

const FIRST_FIELDS: PlacementFields = {
  state: 'starting',
  tier: null,
  basicLimits: null,
  readOnly: false,
  route: null,
  reason: null,
};

const NO_COUNTERS: PlacementCounters = {
  cacheBytes: 0,
  pinnedBytes: 0,
  openFiles: 0,
  pendingUploads: 0,
};

interface Entry {
  fields: PlacementFields;
  counters: PlacementCounters;
  sentFields: string | null;
  sentCounters: string | null;
}

export class PlacementStates {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly sink: StateSink,
    private readonly now: () => Date,
  ) {}

  fields(id: string): PlacementFields | undefined {
    return this.entries.get(id)?.fields;
  }

  set(id: string, change: Partial<PlacementFields>): void {
    const entry = this.entryOf(id);
    entry.fields = { ...entry.fields, ...change };
    if (JSON.stringify(entry.fields) !== entry.sentFields) this.send(id, entry);
  }

  counters(id: string, change: Partial<PlacementCounters>): void {
    const entry = this.entryOf(id);
    entry.counters = { ...entry.counters, ...change };
    if (this.sink.mountsDemanded() && JSON.stringify(entry.counters) !== entry.sentCounters) {
      this.send(id, entry);
    }
  }

  demanded(on: boolean): void {
    if (!on) return;
    for (const [id, entry] of this.entries) {
      if (JSON.stringify(entry.counters) !== entry.sentCounters) this.send(id, entry);
    }
  }

  forget(id: string): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  private entryOf(id: string): Entry {
    const known = this.entries.get(id);
    if (known !== undefined) return known;
    const created: Entry = {
      fields: FIRST_FIELDS,
      counters: NO_COUNTERS,
      sentFields: null,
      sentCounters: null,
    };
    this.entries.set(id, created);
    return created;
  }

  private send(id: string, entry: Entry): void {
    this.entries.set(id, {
      ...entry,
      sentFields: JSON.stringify(entry.fields),
      sentCounters: JSON.stringify(entry.counters),
    });
    this.sink.report({
      placementId: id,
      ...entry.fields,
      ...entry.counters,
      reportedAt: this.now().toISOString(),
    });
  }
}

export type HelperState = 'starting' | 'mounted' | 'stopped' | 'failed';

export interface Running {
  readonly placement: DrivePlacement;
  helperState: HelperState;
  reason: string | null;
}

const OFFLINE_REASON = 'The hub cannot be reached';
const MOUNT_READ_ONLY = true;

export function specOf(placement: DrivePlacement): string {
  return JSON.stringify([
    placement.rootId,
    placement.folderItemId,
    placement.mode,
    placement.localPath,
  ]);
}

export function isActive(placement: DrivePlacement): boolean {
  return placement.enabled && placement.hold === null;
}

export function inOrder(first: DrivePlacement, second: DrivePlacement): number {
  return first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id);
}

export function mountFields(running: Running, route: RouteKind): PlacementFields {
  const base = { tier: 'full', basicLimits: null, readOnly: MOUNT_READ_ONLY, route } as const;
  switch (running.helperState) {
    case 'starting':
      return { ...base, state: 'starting', reason: null };
    case 'mounted':
      return route === null
        ? { ...base, state: 'offline', reason: OFFLINE_REASON }
        : { ...base, state: 'mounted', reason: null };
    case 'stopped':
      return { ...base, state: 'stopped', reason: running.reason ?? 'The mount stopped' };
    case 'failed':
      return { ...base, state: 'failed', reason: running.reason ?? 'The mount failed' };
  }
}
