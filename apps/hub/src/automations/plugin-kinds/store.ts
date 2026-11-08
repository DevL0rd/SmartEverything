import {
  AUTOMATION_PLUGIN_KIND_ROW,
  appendTo,
  type AutomationPluginKindRow,
  type NodeKind,
  type NodeOrigin,
  type PluginKindStatus,
} from '@smarteverything/domain';
import { interfaceHash } from '@smarteverything/flow/functions/interface-hash';
import { Logger } from '@smarteverything/logging';
import { storedRow } from '../../store/codec';
import type { StoreContext } from '../../store/context';
import { jsonText } from '../../store/sql';
import type { KindCatalog } from './catalog';
import { prunableKinds } from './versions';

const log = new Logger('hub.plugin-kinds');

const COLUMNS = 'kind_id, owner, version, interface_hash, declaration, status, updated';

const STORED = storedRow(AUTOMATION_PLUGIN_KIND_ROW, { json: ['declaration'] });

const SAVE = `insert into automation_plugin_kinds (${COLUMNS})
  values ($kind_id, $owner, $version, $interface_hash, $declaration, $status, $updated)
  on conflict (kind_id) do update set
    owner = excluded.owner, version = excluded.version, interface_hash = excluded.interface_hash,
    declaration = excluded.declaration, status = excluded.status, updated = excluded.updated`;

const REMOVE = 'delete from automation_plugin_kinds where kind_id = $kind_id';

const SET_STATUS =
  'update automation_plugin_kinds set status = $status, updated = $updated where kind_id = $kind_id';

class PluginKindOwnerError extends Error {
  override readonly name = 'PluginKindOwnerError';

  constructor(kindId: string, owner: string) {
    super(`The kind ${kindId} does not belong to ${owner}.`);
  }
}

export interface PluginKindsPublished {
  readonly inserted: number;
  readonly updated: number;
  readonly retired: number;
  readonly rejected: readonly { readonly kindId: string; readonly problems: readonly string[] }[];
}

export function kindOwnerOf(origin: Pick<NodeOrigin, 'kind' | 'id'>): string {
  return `${origin.kind}:${origin.id}`;
}

function rowOf(
  kind: NodeKind,
  version: number,
  owner: string,
  updated: string,
): Record<string, unknown> {
  return {
    kind_id: kind.id,
    owner,
    version: String(version),
    interface_hash: interfaceHash({
      inputs: kind.inputs,
      outputs: kind.outputs,
      exits: kind.exits,
    }),
    declaration: kind,
    status: 'active',
    updated,
  };
}

function unchanged(before: AutomationPluginKindRow, after: AutomationPluginKindRow): boolean {
  return (
    before.owner === after.owner &&
    before.version === after.version &&
    before.interface_hash === after.interface_hash &&
    before.status === after.status &&
    jsonText(before.declaration) === jsonText(after.declaration)
  );
}

function ownedBy(kind: NodeKind, owner: string): void {
  if (kind.origin === undefined || kindOwnerOf(kind.origin) !== owner) {
    throw new PluginKindOwnerError(kind.id, owner);
  }
}

export class PluginKindStore {
  constructor(private readonly context: StoreContext) {}

  all(): AutomationPluginKindRow[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from automation_plugin_kinds order by kind_id`,
    );
  }

  forOwner(owner: string): AutomationPluginKindRow[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from automation_plugin_kinds where owner = $owner order by kind_id`,
      { owner },
    );
  }

  publish(owner: string, kinds: readonly NodeKind[]): PluginKindsPublished {
    const updated = this.context.now();
    const rejected: { kindId: string; problems: readonly string[] }[] = [];
    const wanted = new Map<string, AutomationPluginKindRow>();
    for (const kind of kinds) {
      ownedBy(kind, owner);
      if (kind.version === undefined) {
        const problems = ['the kind declares no version'];
        log.warn('plugin_kinds.row_rejected', { owner, kind: kind.id, problems });
        rejected.push({ kindId: kind.id, problems });
        continue;
      }
      const parsed = AUTOMATION_PLUGIN_KIND_ROW.safeParse(
        rowOf(kind, kind.version, owner, updated),
      );
      if (parsed.success) wanted.set(kind.id, parsed.data);
      else {
        const problems = parsed.error.issues.map((issue) => issue.message);
        log.warn('plugin_kinds.row_rejected', { owner, kind: kind.id, problems });
        rejected.push({ kindId: kind.id, problems });
      }
    }
    return this.context.write(() => ({
      ...this.place(owner, wanted, updated),
      rejected,
    }));
  }

  prune(used: ReadonlySet<string>): number {
    return this.context.write(() => {
      const doomed = new Set(prunableKinds(this.all(), used));
      const rows = this.all().filter((row) => doomed.has(row.kind_id));
      for (const before of rows) {
        this.context.sql.run('remove the unused retired plugin kind', REMOVE, {
          kind_id: before.kind_id,
        });
        this.context.changed('automation_plugin_kinds', 'DELETE', null, before);
        log.info('plugin_kinds.pruned', { kind: before.kind_id, owner: before.owner });
      }
      return rows.length;
    });
  }

  switchOff(owner: string): number {
    const updated = this.context.now();
    return this.context.write(() => {
      const active = this.forOwner(owner).filter((row) => row.status === 'active');
      for (const before of active) this.markStatus(before, 'off', updated);
      return active.length;
    });
  }

  private place(
    owner: string,
    wanted: ReadonlyMap<string, AutomationPluginKindRow>,
    updated: string,
  ): Omit<PluginKindsPublished, 'rejected'> {
    const known = new Map(this.forOwner(owner).map((row) => [row.kind_id, row]));
    let inserted = 0;
    let changed = 0;
    for (const row of wanted.values()) {
      const before = known.get(row.kind_id) ?? this.find(row.kind_id);
      if (before !== undefined && unchanged(before, row)) continue;
      this.save(row);
      this.context.changed(
        'automation_plugin_kinds',
        before === undefined ? 'INSERT' : 'UPDATE',
        row,
        before ?? null,
      );
      if (before === undefined) inserted += 1;
      else changed += 1;
    }
    const gone = [...known.values()].filter(
      (row) => !wanted.has(row.kind_id) && row.status !== 'retired',
    );
    for (const before of gone) this.markStatus(before, 'retired', updated);
    return { inserted, updated: changed, retired: gone.length };
  }

  find(kindId: string): AutomationPluginKindRow | undefined {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from automation_plugin_kinds where kind_id = $kind_id`,
      { kind_id: kindId },
    )[0];
  }

  private markStatus(
    before: AutomationPluginKindRow,
    status: PluginKindStatus,
    updated: string,
  ): void {
    this.context.sql.run('set the status of the stored plugin kind', SET_STATUS, {
      kind_id: before.kind_id,
      status,
      updated,
    });
    this.context.changed(
      'automation_plugin_kinds',
      'UPDATE',
      { ...before, status, updated },
      before,
    );
  }

  private save(row: AutomationPluginKindRow): void {
    this.context.sql.run('save the stored plugin kind', SAVE, {
      kind_id: row.kind_id,
      owner: row.owner,
      version: row.version,
      interface_hash: row.interface_hash,
      declaration: jsonText(row.declaration),
      status: row.status,
      updated: row.updated,
    });
  }
}

function kindsByOwner(kinds: readonly NodeKind[]): Map<string, NodeKind[]> {
  const byOwner = new Map<string, NodeKind[]>();
  for (const kind of kinds) {
    if (kind.origin === undefined) continue;
    appendTo(byOwner, kindOwnerOf(kind.origin), kind);
  }
  return byOwner;
}

export function persistPluginKinds(
  catalog: Pick<KindCatalog, 'kinds' | 'owners' | 'changes'>,
  store: Pick<PluginKindStore, 'publish' | 'switchOff' | 'prune'>,
  used: () => ReadonlySet<string>,
): () => void {
  let present: ReadonlySet<string> = new Set();
  const write = (): void => {
    try {
      const byOwner = kindsByOwner(catalog.kinds());
      const owners = new Set([...catalog.owners(), ...byOwner.keys()]);
      for (const owner of owners) store.publish(owner, byOwner.get(owner) ?? []);
      for (const owner of present) if (!owners.has(owner)) store.switchOff(owner);
      present = owners;
      store.prune(used());
    } catch (cause) {
      log.error('plugin_kinds.persist_failed', cause);
    }
  };
  write();
  return catalog.changes(write);
}
